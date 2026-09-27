/**
 * Audio Speech Classification Pipeline
 * 
 * Pipeline Architecture:
 * Microphone Stream
 *     ↓
 * Audio Preprocessing (90Hz Highpass Filter + Formant Bandpass + Float/Byte extraction)
 *     ↓
 * Noise Suppression (Dynamic Multi-Band Noise Floor Tracking for Fan / AC / PC noise)
 *     ↓
 * Voice Activity Detection (VAD) (Core Vocal SNR + ZCR + Energy Concentration)
 *     ↓
 * Speech / Non-Speech Classifier:
 *   - Pitch Periodicity / Normalized Autocorrelation (Voiced speech vs. Fan / White noise)
 *   - Transient Crest Factor & Duration (Rejects Keyboard typing / Mouse clicks)
 *   - Friction Band Ratio & Energy Attack (Rejects Coughs / Sneezes / Throat clearing)
 *   - Sub-bass Ratio (Rejects Chair movements / Door thuds)
 *   - Formant Resonance & Modulation (Detects Whispering & Quiet Speech)
 *     ↓
 * Temporal Smoothing / Confirmation State Machine (Requires consecutive frames + hangover time)
 *     ↓
 * Confidence Calculation (0.0 - 1.0 composite confidence)
 *     ↓
 * Dispatch SPEECH_DETECTED Event
 */

export type SpeechClassificationType =
  | "NORMAL_SPEECH"
  | "QUIET_SPEECH"
  | "WHISPER"
  | "NONE";

export type RejectedSoundType =
  | "COUGH_SNEEZE"
  | "THROAT_CLEARING"
  | "KEYBOARD_MOUSE"
  | "LOW_FREQ_IMPACT"
  | "STATIONARY_NOISE"
  | "SHORT_TRANSIENT";

export interface SpeechAnalysisMetrics {
  rms: number;
  snrDb: number;
  harmonicity: number; // 0.0 - 1.0 (Normalized Autocorrelation Peak in 80Hz - 350Hz range)
  vocalRatio: number; // 0.0 - 1.0 (energy in 200Hz - 3400Hz vs total)
  frictionRatio: number; // energy in 3500Hz - 8000Hz vs vocal
  crestFactor: number; // Peak / RMS ratio
  zeroCrossingRate: number; // Crossings per sample
  isCandidateSpeech: boolean;
  speechType: SpeechClassificationType;
  rejectedType?: RejectedSoundType;
  confidence: number; // 0.0 - 1.0
  consecutiveSpeechFrames: number;
  confirmedDurationMs: number;
}

export interface AudioClassifierCallbacks {
  onSpeechConfirmed: (metrics: SpeechAnalysisMetrics) => void;
  onVolumeUpdate?: (normalizedPercent: number) => void;
  onDebugFrame?: (metrics: SpeechAnalysisMetrics) => void;
}

export class AudioSpeechClassifier {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream;
  private callbacks: AudioClassifierCallbacks;

  // Web Audio Nodes
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private highpassFilter: BiquadFilterNode | null = null;
  private analyser: AnalyserNode | null = null;

  // Analysis buffers
  private freqData: Uint8Array = new Uint8Array(0);
  private timeData: Float32Array = new Float32Array(0);
  private timeDataBytes: Uint8Array = new Uint8Array(0);

  // Frequency band bin ranges
  private subBassMaxBin = 0; // < 150 Hz
  private vocalMinBin = 0; // ~180 Hz
  private vocalMaxBin = 0; // ~3400 Hz
  private frictionMinBin = 0; // ~3600 Hz
  private frictionMaxBin = 0; // ~8000 Hz

  // Multi-band Dynamic Noise Floor Tracking (for Fan, AC, Laptop Hum suppression)
  private noiseFloorSubBass = 0.5;
  private noiseFloorVocal = 1.0;
  private noiseFloorFriction = 0.5;
  private noiseFloorRms = 0.5;
  private calibrationFrames = 0;

  // Temporal Smoothing State Machine
  // 0 = IDLE, 1 = POSSIBLE_SPEECH, 2 = CONFIRMING_SPEECH, 3 = CONFIRMED_SPEECH, 4 = HANGOVER
  private temporalState: "IDLE" | "POSSIBLE" | "CONFIRMING" | "CONFIRMED" | "HANGOVER" = "IDLE";
  private consecutiveSpeechFrames = 0;
  private speechStartTimestamp = 0;
  private hangoverFramesRemaining = 0;
  private coughCooldownFrames = 0;
  private prevRms = 0.5;

  // Animation frame loop
  private animationFrameId: number | null = null;
  private isRunning = false;
  private lastUiMeterTime = 0;
  private lastConfirmedEventTime = 0;

  constructor(mediaStream: MediaStream, callbacks: AudioClassifierCallbacks) {
    this.mediaStream = mediaStream;
    this.callbacks = callbacks;
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtxClass();

      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume().catch(() => {});
      }

      const sampleRate = this.audioContext.sampleRate || 48000;

      // 1. Preprocessing: 90Hz 12dB/octave Highpass filter
      // Strips DC offset, table vibration, desk bumps, 50Hz/60Hz AC electrical hum
      this.highpassFilter = this.audioContext.createBiquadFilter();
      this.highpassFilter.type = "highpass";
      this.highpassFilter.frequency.setValueAtTime(90, this.audioContext.currentTime);
      this.highpassFilter.Q.setValueAtTime(0.707, this.audioContext.currentTime);

      // 2. Analyser Node
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.20;

      // Connect graph: Microphone -> Highpass -> Analyser
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.sourceNode.connect(this.highpassFilter);
      this.highpassFilter.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount; // 512 bins
      const binResolution = sampleRate / this.analyser.fftSize; // e.g. ~46.875 Hz/bin at 48kHz

      this.freqData = new Uint8Array(bufferLength);
      this.timeData = new Float32Array(this.analyser.fftSize);
      this.timeDataBytes = new Uint8Array(this.analyser.fftSize);

      // Sub-band bin allocations
      this.subBassMaxBin = Math.max(1, Math.floor(150 / binResolution));
      this.vocalMinBin = Math.max(this.subBassMaxBin + 1, Math.floor(180 / binResolution));
      this.vocalMaxBin = Math.min(bufferLength - 1, Math.ceil(3400 / binResolution));
      this.frictionMinBin = Math.min(bufferLength - 1, Math.floor(3600 / binResolution));
      this.frictionMaxBin = Math.min(bufferLength - 1, Math.ceil(8000 / binResolution));

      this.isRunning = true;
      this.calibrationFrames = 0;

      this.processLoop();
      console.log(`[AudioClassifier] Pipeline initialized. Rate: ${sampleRate}Hz, vocal bins ${this.vocalMinBin}-${this.vocalMaxBin}`);
    } catch (err) {
      console.error("[AudioClassifier] Failed to start audio pipeline:", err);
      throw err;
    }
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    try {
      this.sourceNode?.disconnect();
      this.highpassFilter?.disconnect();
      this.analyser?.disconnect();
    } catch {
      // Ignore disconnect errors
    }

    if (this.audioContext && this.audioContext.state !== "closed") {
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
    this.analyser.getByteTimeDomainData(this.timeDataBytes as any);

    // Run the complete 7-stage processing pipeline on this audio frame
    const metrics = this.analyzeFrame();

    // Live UI Volume Meter Update (every 60ms)
    const now = Date.now();
    if (now - this.lastUiMeterTime > 60) {
      this.lastUiMeterTime = now;
      if (this.callbacks.onVolumeUpdate) {
        // Logarithmic responsive meter scaling
        const normalized = Math.min(100, Math.round((metrics.rms / 8.0) * 100));
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
    // 1. Time-Domain Metrics: RMS Amplitude & Peak
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

      // Zero-crossing check
      if ((val >= 0 && prevVal < 0) || (val < 0 && prevVal >= 0)) {
        zeroCrossings++;
      }
      prevVal = val;
    }

    // Scale RMS to 0 - 100 integer range for intuitive thresholding
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
    let maxVocalBinVal = 0;
    for (let i = this.vocalMinBin; i <= this.vocalMaxBin; i++) {
      const v = this.freqData[i];
      vocalSum += v;
      if (v > maxVocalBinVal) maxVocalBinVal = v;
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
    // 3. Noise Suppression: Dynamic Multi-Band Noise Floor Tracking (Fan / AC)
    // -------------------------------------------------------------------------
    if (this.calibrationFrames < 90) {
      // Initial 2-second ambient calibration
      this.calibrationFrames++;
      this.noiseFloorRms = this.noiseFloorRms * 0.95 + rms * 0.05;
      this.noiseFloorVocal = this.noiseFloorVocal * 0.95 + vocalEnergy * 0.05;
      this.noiseFloorFriction = this.noiseFloorFriction * 0.95 + frictionEnergy * 0.05;
      this.noiseFloorSubBass = this.noiseFloorSubBass * 0.95 + subBassEnergy * 0.05;
    } else {
      // Continuous background noise adaptation:
      // Fast tracking downwards if quiet, very slow tracking upwards if steady (fan/AC)
      // When confirmed speech is occurring, noise floor is completely FROZEN!
      if (this.temporalState === "IDLE" || this.temporalState === "POSSIBLE") {
        if (vocalEnergy < this.noiseFloorVocal) {
          this.noiseFloorVocal = this.noiseFloorVocal * 0.90 + vocalEnergy * 0.10;
        } else if (vocalEnergy < this.noiseFloorVocal * 1.6) {
          // Slowly absorb steady fan / AC increase without absorbing speech bursts
          this.noiseFloorVocal = this.noiseFloorVocal * 0.998 + vocalEnergy * 0.002;
        }

        if (rms < this.noiseFloorRms) {
          this.noiseFloorRms = this.noiseFloorRms * 0.90 + rms * 0.10;
        } else if (rms < this.noiseFloorRms * 1.5) {
          this.noiseFloorRms = this.noiseFloorRms * 0.998 + rms * 0.002;
        }

        if (frictionEnergy < this.noiseFloorFriction) {
          this.noiseFloorFriction = this.noiseFloorFriction * 0.90 + frictionEnergy * 0.10;
        } else if (frictionEnergy < this.noiseFloorFriction * 1.6) {
          this.noiseFloorFriction = this.noiseFloorFriction * 0.998 + frictionEnergy * 0.002;
        }
      }
    }

    // Sub-Band Vocal Signal-to-Noise Ratio (SNR) in dB over baseline
    const safeVocalNoise = Math.max(0.2, this.noiseFloorVocal);
    const snrDb = 10 * Math.log10(Math.max(0.1, vocalEnergy) / safeVocalNoise);

    // -------------------------------------------------------------------------
    // 4. Normalized Autocorrelation (Harmonicity / Pitch Periodicity)
    // Distinguishes human vocal tract harmonics from white noise, AC hum, and fan hiss
    // -------------------------------------------------------------------------
    const harmonicity = this.computePitchHarmonicity();

    // -------------------------------------------------------------------------
    // 5. Non-Speech Rejection Classifiers (Cough, Sneeze, Clicks, Fan, Thuds)
    // -------------------------------------------------------------------------
    let rejectedType: RejectedSoundType | undefined = undefined;

    // A. Sudden Cough / Sneeze Detector:
    // A cough or sneeze features explosive onset (steep RMS rise > 3.5), massive friction band ratio,
    // and no quasi-periodic pitch harmonics.
    const rmsRise = rms - this.prevRms;
    const isExplosiveAttack = rmsRise > 3.5 && rms > 4.5;
    const isCoughSneezePattern =
      (isExplosiveAttack && frictionRatio > 0.65 && harmonicity < 0.28) ||
      (rms > 6.0 && frictionRatio > 0.85 && vocalRatio < 0.40);

    if (isCoughSneezePattern) {
      this.coughCooldownFrames = 30; // Freeze candidate speech for ~500ms
      rejectedType = "COUGH_SNEEZE";
    }

    if (this.coughCooldownFrames > 0) {
      this.coughCooldownFrames--;
      if (!rejectedType) rejectedType = "COUGH_SNEEZE";
    }

    // B. Keyboard Typing & Mouse Click Detector:
    // Clicks are sharp transients with high Crest Factor (> 4.2), short impulse duration, and zero harmonicity
    const isClickOrTyping = crestFactor > 4.2 && harmonicity < 0.25 && vocalRatio < 0.50;
    if (isClickOrTyping) {
      rejectedType = "KEYBOARD_MOUSE";
    }

    // C. Low Frequency Impact (Chair movement, Desk thud, Door sound):
    // Heavy energy concentrated below 150 Hz without mid-formants
    const isLowFreqImpact = subBassEnergy > vocalEnergy * 1.5 && vocalRatio < 0.35;
    if (isLowFreqImpact) {
      rejectedType = "LOW_FREQ_IMPACT";
    }

    // D. Stationary Background Noise (Fan / AC / Laptop Fan):
    // Steady noise floor where SNR over dynamic noise baseline is low (SNR < 2.5 dB)
    const isStationaryNoise = snrDb < 2.5 || (harmonicity < 0.22 && vocalRatio < 0.42);
    if (!rejectedType && isStationaryNoise && rms < this.noiseFloorRms * 1.8) {
      rejectedType = "STATIONARY_NOISE";
    }

    this.prevRms = rms;

    // -------------------------------------------------------------------------
    // 6. Speech Classification & Quiet Speech / Whispering Detection
    // -------------------------------------------------------------------------
    let isCandidateSpeech = false;
    let speechType: SpeechClassificationType = "NONE";
    let confidence = 0.0;

    if (!rejectedType && this.coughCooldownFrames === 0) {
      // 1. Normal Human Speech:
      // Strong harmonicity, healthy SNR, concentrated vocal core formants
      const isNormalSpeech =
        snrDb >= 3.8 &&
        harmonicity >= 0.32 &&
        vocalRatio >= 0.48 &&
        zeroCrossingRate >= 0.03 &&
        zeroCrossingRate <= 0.35;

      // 2. Quiet / Low-Volume Speech:
      // Candidate speaks softly; absolute volume is low, but SNR relative to quiet baseline is distinct,
      // and pitch harmonics or vocal formants are clearly preserved
      const isQuietSpeech =
        !isNormalSpeech &&
        snrDb >= 2.8 &&
        harmonicity >= 0.28 &&
        vocalRatio >= 0.52 &&
        rms >= 1.0;

      // 3. Whispering / Unvoiced Speech:
      // Vocal cords do not vibrate periodically (low harmonicity), but vocal tract shapes formants:
      // Energy concentrated in F1/F2 (250-2500Hz), rolling off above 3500Hz, with distinct ZCR
      const isWhisper =
        !isNormalSpeech &&
        !isQuietSpeech &&
        snrDb >= 2.5 &&
        vocalRatio >= 0.55 &&
        frictionRatio <= 0.55 &&
        zeroCrossingRate >= 0.08 &&
        zeroCrossingRate <= 0.38 &&
        rms >= 0.8;

      if (isNormalSpeech) {
        isCandidateSpeech = true;
        speechType = "NORMAL_SPEECH";
        // Confidence calculation:
        const harmScore = Math.min(1.0, harmonicity / 0.65);
        const snrScore = Math.min(1.0, (snrDb - 3.0) / 10.0);
        const vocalScore = Math.min(1.0, vocalRatio / 0.70);
        confidence = Math.max(0.65, 0.40 * harmScore + 0.35 * snrScore + 0.25 * vocalScore);
      } else if (isQuietSpeech) {
        isCandidateSpeech = true;
        speechType = "QUIET_SPEECH";
        const harmScore = Math.min(1.0, harmonicity / 0.50);
        const snrScore = Math.min(1.0, (snrDb - 2.0) / 7.0);
        const vocalScore = Math.min(1.0, vocalRatio / 0.65);
        confidence = Math.max(0.60, 0.35 * harmScore + 0.35 * snrScore + 0.30 * vocalScore);
      } else if (isWhisper) {
        isCandidateSpeech = true;
        speechType = "WHISPER";
        const snrScore = Math.min(1.0, (snrDb - 2.0) / 6.0);
        const formantScore = Math.min(1.0, vocalRatio / 0.60);
        confidence = Math.max(0.58, 0.50 * snrScore + 0.50 * formantScore);
      }
    }

    // -------------------------------------------------------------------------
    // 7. Temporal Smoothing & Confirmation State Machine
    // Requires consecutive frames + hangover bridging. NEVER triggers on single frame!
    // -------------------------------------------------------------------------
    let confirmedDurationMs = 0;

    if (isCandidateSpeech) {
      this.consecutiveSpeechFrames++;
      this.hangoverFramesRemaining = 8; // ~240ms hangover to bridge stop consonants

      if (this.temporalState === "IDLE") {
        this.temporalState = "POSSIBLE";
        this.speechStartTimestamp = now;
      } else if (this.temporalState === "POSSIBLE" && this.consecutiveSpeechFrames >= 2) {
        this.temporalState = "CONFIRMING";
      } else if (this.temporalState === "CONFIRMING" && this.consecutiveSpeechFrames >= 4) {
        this.temporalState = "CONFIRMED";
      }
    } else {
      if (this.hangoverFramesRemaining > 0 && this.temporalState === "CONFIRMED") {
        // Hangover state: maintain speech confirmation across micro-pauses between syllables
        this.hangoverFramesRemaining--;
        this.temporalState = "HANGOVER";
      } else {
        // Speech ended or non-speech noise occurred
        this.consecutiveSpeechFrames = Math.max(0, this.consecutiveSpeechFrames - 2);
        if (this.consecutiveSpeechFrames === 0) {
          this.temporalState = "IDLE";
          this.speechStartTimestamp = 0;
        }
      }
    }

    // -------------------------------------------------------------------------
    // 8. Event Confirmation Dispatch
    // Only fires when speech is confirmed over at least 320ms and confidence >= 0.60
    // -------------------------------------------------------------------------
    if (this.temporalState === "CONFIRMED" || this.temporalState === "HANGOVER") {
      confirmedDurationMs = now - this.speechStartTimestamp;

      // Confirmed speech event trigger criteria:
      // Minimum duration 320ms (at least 10-12 consecutive frames of validated speech)
      // Debounce trigger by at least 6 seconds between repeated alerts
      if (confirmedDurationMs >= 320 && confidence >= 0.60) {
        if (now - this.lastConfirmedEventTime >= 6000) {
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
   * Evaluates lag range tau corresponding to human pitch fundamentals 80 Hz to 350 Hz.
   * Returns maximum peak normalized correlation in [0.0, 1.0].
   */
  private computePitchHarmonicity(): number {
    const sampleRate = this.audioContext?.sampleRate || 48000;
    const minLag = Math.floor(sampleRate / 350); // ~137 at 48kHz (350 Hz pitch ceiling)
    const maxLag = Math.min(500, Math.ceil(sampleRate / 80)); // ~500 at 48kHz (80 Hz pitch floor)
    const windowSize = 384; // Window length for correlation

    if (this.timeData.length < maxLag + windowSize) {
      return 0.0;
    }

    // Compute energy of reference window
    let e0 = 0.0;
    for (let i = 0; i < windowSize; i++) {
      const v = this.timeData[i];
      e0 += v * v;
    }

    if (e0 < 0.0001) return 0.0;

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

      if (eTau > 0.0001) {
        // Normalized cross-correlation coefficient
        const normCorr = crossSum / Math.sqrt(e0 * eTau);
        if (normCorr > maxCorrelation) {
          maxCorrelation = normCorr;
        }
      }
    }

    return Math.max(0.0, Math.min(1.0, maxCorrelation));
  }
}
