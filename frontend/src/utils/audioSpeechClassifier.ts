/**
 * AudioSpeechClassifier.ts
 *
 * Real-time microphone audio detection and classification pipeline for the proctoring system.
 *
 * PIPELINE STAGES:
 * 1. Preprocessing: 85Hz Biquad highpass filter (removes DC offset, desk rumble, 50/60Hz AC electrical hum)
 * 2. Multi-Band Noise Suppression: Continuous background floor tracking (absorbs fan, AC, laptop cooler)
 * 3. Voice Activity Detection (VAD): Sub-band vocal SNR (180Hz - 3400Hz), Zero-Crossing Rate, Formant Concentration
 * 4. Acoustic Non-Speech Rejection:
 *    - Crest factor & transient sharpness (rejects keyboard clicks, mouse clicks)
 *    - Explosive high-frequency friction bursts (rejects coughs, sneezes, throat clearing)
 *    - Low-frequency sub-bass ratio (rejects chair scrapes, door thuds)
 *    - Stationary noise ceiling (rejects steady fan / AC drone)
 * 5. Pitch Periodicity: Normalized Autocorrelation Function (NACF) in human fundamental pitch range (75Hz - 400Hz)
 * 6. Multi-tier Speech Classifier:
 *    - Normal human speech
 *    - Low-volume / quiet speech
 *    - Whispering / unvoiced speech
 * 7. Temporal Smoothing State Machine:
 *    - IDLE -> POSSIBLE -> CONFIRMING -> CONFIRMED -> HANGOVER
 *    - Multi-frame confirmation (>= 160ms) ensures single transient frames never cause violations
 *    - Hangover bridging maintains speech detection across brief stop-consonant silence
 * 8. Confidence Scoring & Dispatch:
 *    - Multi-feature weighted confidence [0.0 - 1.0]
 */

export type SpeechClassificationType =
  | "NONE"
  | "NORMAL_SPEECH"
  | "QUIET_SPEECH"
  | "WHISPER";

export type RejectedSoundType =
  | "COUGH_SNEEZE"
  | "KEYBOARD_MOUSE"
  | "LOW_FREQ_IMPACT"
  | "STATIONARY_NOISE";

export interface SpeechAnalysisMetrics {
  rms: number; // 0 - 100 scaled RMS level
  snrDb: number; // Sub-band vocal signal-to-noise ratio in dB
  harmonicity: number; // Pitch correlation [0.0 - 1.0]
  vocalRatio: number; // Vocal band energy / total spectrum
  frictionRatio: number; // Upper friction energy / vocal energy
  crestFactor: number; // Peak / RMS ratio (high for clicks)
  zeroCrossingRate: number; // Zero crossing rate
  isCandidateSpeech: boolean;
  speechType: SpeechClassificationType;
  rejectedType?: RejectedSoundType;
  confidence: number; // [0.0 - 1.0]
  consecutiveSpeechFrames: number;
  confirmedDurationMs: number;
}

export interface AudioClassifierCallbacks {
  onSpeechConfirmed: (metrics: SpeechAnalysisMetrics) => void;
  onVolumeUpdate?: (normalizedLevel: number) => void;
  onDebugFrame?: (metrics: SpeechAnalysisMetrics) => void;
}

export class AudioSpeechClassifier {
  private audioContext: AudioContext | null = null;
  private isExternalAudioContext = false;
  private mediaStream: MediaStream;
  private callbacks: AudioClassifierCallbacks;

  // Web Audio Nodes
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private highpassFilter: BiquadFilterNode | null = null;
  private analyser: AnalyserNode | null = null;

  // Analysis buffers
  private freqData: Uint8Array = new Uint8Array(0);
  private timeData: Float32Array = new Float32Array(0);

  // Frequency band bin ranges
  private subBassMaxBin = 0; // < 150 Hz
  private vocalMinBin = 0; // ~180 Hz
  private vocalMaxBin = 0; // ~3400 Hz
  private frictionMinBin = 0; // ~3600 Hz
  private frictionMaxBin = 0; // ~8000 Hz

  // Multi-band Dynamic Noise Floor Tracking (for Fan, AC, Laptop Cooler suppression)
  private noiseFloorSubBass = 1.0;
  private noiseFloorVocal = 1.5;
  private noiseFloorFriction = 1.0;
  private noiseFloorRms = 1.0;
  private calibrationFrames = 0;

  // Temporal Smoothing State Machine
  private temporalState: "IDLE" | "POSSIBLE" | "CONFIRMING" | "CONFIRMED" | "HANGOVER" = "IDLE";
  private consecutiveSpeechFrames = 0;
  private speechStartTimestamp = 0;
  private hangoverFramesRemaining = 0;
  private coughCooldownFrames = 0;
  private prevRms = 1.0;

  // Animation frame loop
  private animationFrameId: number | null = null;
  private isRunning = false;
  private lastUiMeterTime = 0;
  private lastConfirmedEventTime = 0;
  private resumeHandler: (() => void) | null = null;

  constructor(
    mediaStream: MediaStream,
    callbacks: AudioClassifierCallbacks,
    existingContext?: AudioContext | null
  ) {
    this.mediaStream = mediaStream;
    this.callbacks = callbacks;
    if (existingContext && existingContext.state !== "closed") {
      this.audioContext = existingContext;
      this.isExternalAudioContext = true;
    }
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;

    try {
      if (!this.audioContext || this.audioContext.state === "closed") {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        this.audioContext = new AudioCtxClass();
        this.isExternalAudioContext = false;
      }

      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume().catch(() => {});
      }

      // Keep context awake on user interaction
      this.resumeHandler = () => {
        if (this.audioContext && this.audioContext.state === "suspended") {
          this.audioContext.resume().catch(() => {});
        }
      };
      window.addEventListener("click", this.resumeHandler);
      window.addEventListener("keydown", this.resumeHandler);

      const sampleRate = this.audioContext.sampleRate || 48000;

      // 1. Preprocessing: 85Hz Highpass Filter
      // Strips DC offset, table vibration, desk bumps, 50Hz/60Hz AC electrical hum
      this.highpassFilter = this.audioContext.createBiquadFilter();
      this.highpassFilter.type = "highpass";
      this.highpassFilter.frequency.setValueAtTime(85, this.audioContext.currentTime);
      this.highpassFilter.Q.setValueAtTime(0.707, this.audioContext.currentTime);

      // 2. Analyser Node: 2048 FFT for sharp pitch and formant resolution
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.15;

      // Connect graph: Microphone -> Highpass Filter -> Analyser
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.sourceNode.connect(this.highpassFilter);
      this.highpassFilter.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount; // 1024 bins
      const binResolution = sampleRate / this.analyser.fftSize; // ~23.4 Hz/bin at 48kHz

      this.freqData = new Uint8Array(bufferLength);
      this.timeData = new Float32Array(this.analyser.fftSize);

      // Sub-band bin allocations
      this.subBassMaxBin = Math.max(1, Math.floor(150 / binResolution));
      this.vocalMinBin = Math.max(this.subBassMaxBin + 1, Math.floor(180 / binResolution));
      this.vocalMaxBin = Math.min(bufferLength - 1, Math.ceil(3400 / binResolution));
      this.frictionMinBin = Math.min(bufferLength - 1, Math.floor(3600 / binResolution));
      this.frictionMaxBin = Math.min(bufferLength - 1, Math.ceil(8000 / binResolution));

      this.isRunning = true;
      this.calibrationFrames = 0;

      this.processLoop();
      console.log(`[AudioClassifier] Running: rate ${sampleRate}Hz, bin res ${binResolution.toFixed(1)}Hz`);
    } catch (err) {
      console.error("[AudioClassifier] Failed to start pipeline:", err);
      throw err;
    }
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.resumeHandler) {
      window.removeEventListener("click", this.resumeHandler);
      window.removeEventListener("keydown", this.resumeHandler);
      this.resumeHandler = null;
    }

    try {
      this.sourceNode?.disconnect();
      this.highpassFilter?.disconnect();
      this.analyser?.disconnect();
    } catch {
      // Ignore disconnect errors
    }

    if (!this.isExternalAudioContext && this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

  private processLoop = () => {
    if (!this.isRunning || !this.analyser) return;

    if (this.audioContext && this.audioContext.state === "suspended") {
      this.audioContext.resume().catch(() => {});
    }

    this.analyser.getByteFrequencyData(this.freqData as any);
    this.analyser.getFloatTimeDomainData(this.timeData as any);

    // Run the complete classification pipeline on this audio frame
    const metrics = this.analyzeFrame();

    // Live UI Volume Meter Update (every 60ms)
    const now = Date.now();
    if (now - this.lastUiMeterTime > 60) {
      this.lastUiMeterTime = now;
      if (this.callbacks.onVolumeUpdate) {
        const normalized = Math.min(100, Math.round((metrics.rms / 6.0) * 100));
        this.callbacks.onVolumeUpdate(normalized);
      }
    }

    if (this.callbacks.onDebugFrame) {
      this.callbacks.onDebugFrame(metrics);
    }

    this.animationFrameId = requestAnimationFrame(this.processLoop);
  };

  /**
   * Complete Audio Classification & VAD Pipeline
   */
  private analyzeFrame(): SpeechAnalysisMetrics {
    const timeLen = this.timeData.length;
    const now = Date.now();

    // -------------------------------------------------------------------------
    // 1. Time-Domain Metrics: RMS Amplitude, Peak, and Zero Crossing Rate
    // -------------------------------------------------------------------------
    let sumSquares = 0;
    let peakDev = 0;
    let zeroCrossings = 0;
    let prevVal = this.timeData[0];

    for (let i = 0; i < timeLen; i++) {
      const val = this.timeData[i];
      sumSquares += val * val;
      const absVal = Math.abs(val);
      if (absVal > peakDev) peakDev = absVal;

      if ((val >= 0 && prevVal < 0) || (val < 0 && prevVal >= 0)) {
        zeroCrossings++;
      }
      prevVal = val;
    }

    // Scaled RMS (0 - 100 range)
    const rms = Math.sqrt(sumSquares / timeLen) * 100.0;
    const peak = peakDev * 100.0;
    const crestFactor = rms > 0.05 ? peak / rms : 1.0;
    const zeroCrossingRate = zeroCrossings / timeLen;

    // -------------------------------------------------------------------------
    // 2. Frequency-Domain Sub-Band Energy Extraction
    // -------------------------------------------------------------------------
    let subBassSum = 0;
    let subBassCount = 0;
    for (let i = 1; i <= this.subBassMaxBin; i++) {
      subBassSum += this.freqData[i];
      subBassCount++;
    }
    const subBassEnergy = subBassCount > 0 ? subBassSum / subBassCount : 0;

    let vocalSum = 0;
    let vocalCount = 0;
    for (let i = this.vocalMinBin; i <= this.vocalMaxBin; i++) {
      vocalSum += this.freqData[i];
      vocalCount++;
    }
    const vocalEnergy = vocalCount > 0 ? vocalSum / vocalCount : 0;

    let frictionSum = 0;
    let frictionCount = 0;
    for (let i = this.frictionMinBin; i <= this.frictionMaxBin; i++) {
      frictionSum += this.freqData[i];
      frictionCount++;
    }
    const frictionEnergy = frictionCount > 0 ? frictionSum / frictionCount : 0;

    const totalSpectrumEnergy = subBassEnergy + vocalEnergy + frictionEnergy + 0.001;
    const vocalRatio = vocalEnergy / totalSpectrumEnergy;
    const frictionRatio = vocalEnergy > 0 ? frictionEnergy / (vocalEnergy + 0.001) : 0;

    // -------------------------------------------------------------------------
    // 3. Adaptive Noise Floor Tracking (Fan, AC, Laptop Cooler suppression)
    // Fast downward adaptation, slow upward adaptation to absorb stationary fans
    // -------------------------------------------------------------------------
    if (this.calibrationFrames < 60) {
      this.calibrationFrames++;
      this.noiseFloorRms = this.noiseFloorRms * 0.90 + rms * 0.10;
      this.noiseFloorVocal = this.noiseFloorVocal * 0.90 + vocalEnergy * 0.10;
      this.noiseFloorFriction = this.noiseFloorFriction * 0.90 + frictionEnergy * 0.10;
      this.noiseFloorSubBass = this.noiseFloorSubBass * 0.90 + subBassEnergy * 0.10;
    } else {
      if (this.temporalState === "IDLE") {
        if (vocalEnergy < this.noiseFloorVocal) {
          this.noiseFloorVocal = this.noiseFloorVocal * 0.92 + vocalEnergy * 0.08;
        } else if (vocalEnergy < this.noiseFloorVocal * 1.6) {
          this.noiseFloorVocal = this.noiseFloorVocal * 0.995 + vocalEnergy * 0.005;
        }

        if (rms < this.noiseFloorRms) {
          this.noiseFloorRms = this.noiseFloorRms * 0.92 + rms * 0.08;
        } else if (rms < this.noiseFloorRms * 1.6) {
          this.noiseFloorRms = this.noiseFloorRms * 0.995 + rms * 0.005;
        }
      }
    }

    // Sub-Band Vocal SNR in dB over dynamic baseline
    const safeVocalNoise = Math.max(0.5, this.noiseFloorVocal);
    const snrDb = 10 * Math.log10(Math.max(0.1, vocalEnergy) / safeVocalNoise);

    // -------------------------------------------------------------------------
    // 4. Normalized Autocorrelation (Harmonicity / Pitch Periodicity)
    // Evaluates pitch fundamentals (75Hz - 400Hz)
    // -------------------------------------------------------------------------
    const harmonicity = this.computePitchHarmonicity();

    // -------------------------------------------------------------------------
    // 5. Non-Speech Rejection Classifiers (Coughs, Sneezes, Clicks, Fan, Thuds)
    // -------------------------------------------------------------------------
    let rejectedType: RejectedSoundType | undefined = undefined;

    // A. Sudden Cough / Sneeze:
    const rmsRise = rms - this.prevRms;
    const isExplosiveCough = rmsRise > 4.0 && rms > 6.0 && frictionRatio > 0.65 && harmonicity < 0.25;
    if (isExplosiveCough) {
      this.coughCooldownFrames = 15; // ~250ms freeze
      rejectedType = "COUGH_SNEEZE";
    }

    if (this.coughCooldownFrames > 0) {
      this.coughCooldownFrames--;
      if (!rejectedType) rejectedType = "COUGH_SNEEZE";
    }

    // B. Keyboard Typing & Mouse Clicks:
    const isClickOrTyping = crestFactor > 4.2 && rms < 4.0 && harmonicity < 0.22 && vocalRatio < 0.38;
    if (isClickOrTyping) {
      rejectedType = "KEYBOARD_MOUSE";
    }

    // C. Low Frequency Impact (Chair scraping, desk thud, door close):
    const isLowFreqImpact = subBassEnergy > vocalEnergy * 2.0 && vocalRatio < 0.25;
    if (isLowFreqImpact) {
      rejectedType = "LOW_FREQ_IMPACT";
    }

    // D. Stationary Background Noise (Fan / AC / Laptop Fan):
    const isStationaryNoise = snrDb < 2.0 || (harmonicity < 0.22 && vocalRatio < 0.35);
    if (!rejectedType && isStationaryNoise && rms < this.noiseFloorRms * 1.8) {
      rejectedType = "STATIONARY_NOISE";
    }

    this.prevRms = rms;

    // -------------------------------------------------------------------------
    // 6. Speech Classification (Normal, Quiet, Whisper)
    // -------------------------------------------------------------------------
    let isCandidateSpeech = false;
    let speechType: SpeechClassificationType = "NONE";
    let confidence = 0.0;

    if (!rejectedType && this.coughCooldownFrames === 0) {
      // 1. Normal Human Speech:
      const isNormalSpeech =
        snrDb >= 3.0 &&
        harmonicity >= 0.30 &&
        vocalRatio >= 0.30 &&
        rms >= this.noiseFloorRms + 1.0;

      // 2. Quiet / Low-Volume Speech:
      const isQuietSpeech =
        !isNormalSpeech &&
        snrDb >= 2.2 &&
        harmonicity >= 0.24 &&
        vocalRatio >= 0.26 &&
        rms >= this.noiseFloorRms + 0.5;

      // 3. Whispering / Unvoiced Speech:
      const isWhisper =
        !isNormalSpeech &&
        !isQuietSpeech &&
        snrDb >= 1.8 &&
        vocalRatio >= 0.28 &&
        frictionRatio <= 0.65 &&
        zeroCrossingRate >= 0.05 &&
        rms >= this.noiseFloorRms + 0.4;

      if (isNormalSpeech) {
        isCandidateSpeech = true;
        speechType = "NORMAL_SPEECH";
        const harmScore = Math.min(1.0, harmonicity / 0.55);
        const snrScore = Math.min(1.0, Math.max(0, snrDb) / 8.0);
        const vocalScore = Math.min(1.0, vocalRatio / 0.50);
        confidence = Math.max(0.65, 0.40 * harmScore + 0.35 * snrScore + 0.25 * vocalScore);
      } else if (isQuietSpeech) {
        isCandidateSpeech = true;
        speechType = "QUIET_SPEECH";
        const harmScore = Math.min(1.0, harmonicity / 0.45);
        const snrScore = Math.min(1.0, Math.max(0, snrDb) / 6.0);
        const vocalScore = Math.min(1.0, vocalRatio / 0.45);
        confidence = Math.max(0.60, 0.35 * harmScore + 0.35 * snrScore + 0.30 * vocalScore);
      } else if (isWhisper) {
        isCandidateSpeech = true;
        speechType = "WHISPER";
        const snrScore = Math.min(1.0, Math.max(0, snrDb) / 5.0);
        const formantScore = Math.min(1.0, vocalRatio / 0.45);
        confidence = Math.max(0.58, 0.50 * snrScore + 0.50 * formantScore);
      }
    }

    // -------------------------------------------------------------------------
    // 7. Temporal Smoothing State Machine (IDLE -> POSSIBLE -> CONFIRMING -> CONFIRMED)
    // With hangover bridging so brief stop consonants don't drop detection
    // -------------------------------------------------------------------------
    let confirmedDurationMs = 0;

    if (isCandidateSpeech) {
      this.consecutiveSpeechFrames++;
      this.hangoverFramesRemaining = 8; // ~140ms hangover to bridge stop consonants

      if (this.speechStartTimestamp === 0) {
        this.speechStartTimestamp = now;
      }

      if (this.temporalState === "IDLE") {
        this.temporalState = "POSSIBLE";
      } else if (this.consecutiveSpeechFrames >= 2 && this.temporalState === "POSSIBLE") {
        this.temporalState = "CONFIRMING";
      } else if (this.consecutiveSpeechFrames >= 4) {
        this.temporalState = "CONFIRMED";
      }
    } else {
      if (this.hangoverFramesRemaining > 0 && (this.temporalState === "CONFIRMED" || this.temporalState === "CONFIRMING")) {
        this.hangoverFramesRemaining--;
        this.temporalState = "HANGOVER";
      } else {
        this.consecutiveSpeechFrames = 0;
        this.temporalState = "IDLE";
        this.speechStartTimestamp = 0;
      }
    }

    // -------------------------------------------------------------------------
    // 8. Event Confirmation Dispatch
    // Minimum 200ms sustained speech duration, confidence >= 0.58, debounced by 3.5s
    // -------------------------------------------------------------------------
    if (this.temporalState === "CONFIRMED" || this.temporalState === "HANGOVER") {
      confirmedDurationMs = now - this.speechStartTimestamp;

      if (confirmedDurationMs >= 200 && confidence >= 0.58) {
        if (now - this.lastConfirmedEventTime >= 3500) {
          this.lastConfirmedEventTime = now;

          const confirmedMetrics: SpeechAnalysisMetrics = {
            rms: Math.round(rms * 10) / 10,
            snrDb: Math.round(snrDb * 10) / 10,
            harmonicity: Math.round(harmonicity * 100) / 100,
            vocalRatio: Math.round(vocalRatio * 100) / 100,
            frictionRatio: Math.round(frictionRatio * 100) / 100,
            crestFactor: Math.round(crestFactor * 10) / 10,
            zeroCrossingRate: Math.round(zeroCrossingRate * 1000) / 1000,
            isCandidateSpeech: true,
            speechType,
            confidence: Math.round(confidence * 100) / 100,
            consecutiveSpeechFrames: this.consecutiveSpeechFrames,
            confirmedDurationMs,
          };

          console.log(`[AudioClassifier] 🗣️ Confirmed Speech: ${speechType}, Conf: ${Math.round(confidence * 100)}%, RMS: ${metricsToString(rms, snrDb, harmonicity)}`);
          this.callbacks.onSpeechConfirmed(confirmedMetrics);
        }
      }
    }

    return {
      rms: Math.round(rms * 10) / 10,
      snrDb: Math.round(snrDb * 10) / 10,
      harmonicity: Math.round(harmonicity * 100) / 100,
      vocalRatio: Math.round(vocalRatio * 100) / 100,
      frictionRatio: Math.round(frictionRatio * 100) / 100,
      crestFactor: Math.round(crestFactor * 10) / 10,
      zeroCrossingRate: Math.round(zeroCrossingRate * 1000) / 1000,
      isCandidateSpeech,
      speechType,
      rejectedType,
      confidence: Math.round(confidence * 100) / 100,
      consecutiveSpeechFrames: this.consecutiveSpeechFrames,
      confirmedDurationMs,
    };
  }

  /**
   * Fast Normalized Autocorrelation Function (NACF) for pitch period detection
   * Evaluates lag range tau corresponding to human pitch fundamentals 75 Hz to 400 Hz.
   */
  private computePitchHarmonicity(): number {
    const sampleRate = this.audioContext?.sampleRate || 48000;
    const minLag = Math.floor(sampleRate / 400); // 400 Hz pitch ceiling (~120 at 48k)
    const maxLag = Math.min(600, Math.ceil(sampleRate / 75)); // 75 Hz pitch floor (~640 at 48k)
    const windowSize = 400; // Window length for correlation

    if (this.timeData.length < maxLag + windowSize) {
      return 0.0;
    }

    // Compute energy of reference window
    let e0 = 0.0;
    for (let i = 0; i < windowSize; i++) {
      const v = this.timeData[i];
      e0 += v * v;
    }

    if (e0 < 0.00005) return 0.0;

    let maxCorrelation = 0.0;

    // Sub-sample lag search (step by 2 for real-time 60fps efficiency)
    for (let tau = minLag; tau <= maxLag; tau += 2) {
      let crossSum = 0.0;
      let eTau = 0.0;

      for (let i = 0; i < windowSize; i += 2) {
        const x0 = this.timeData[i];
        const xTau = this.timeData[i + tau];
        crossSum += x0 * xTau;
        eTau += xTau * xTau;
      }

      if (eTau > 0.00005) {
        const normCorr = crossSum / Math.sqrt(e0 * eTau);
        if (normCorr > maxCorrelation) {
          maxCorrelation = normCorr;
        }
      }
    }

    return Math.max(0.0, Math.min(1.0, maxCorrelation));
  }
}

function metricsToString(rms: number, snrDb: number, harmonicity: number): string {
  return `rms=${rms.toFixed(1)}, snr=${snrDb.toFixed(1)}dB, harm=${harmonicity.toFixed(2)}`;
}
