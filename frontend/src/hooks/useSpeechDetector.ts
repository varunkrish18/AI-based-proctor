/**
 * useSpeechDetector.ts
 * Adapted from ViBe (vicharanashala/vibe):
 * - frontend/src/components/ai/SpeechDetector.tsx (@mediapipe/tasks-audio YAMNet 16kHz classifier)
 * - v3/apps/student/src/features/onboarding/media-check.tsx (Web Audio AnalyserNode VU meter)
 * - Combined with AudioSpeechClassifier (Formant + Pitch Harmonicity VAD) & Web Speech API
 */

import { useEffect, useRef, useState } from "react";
import { AudioClassifier, FilesetResolver } from "@mediapipe/tasks-audio";
import {
  AudioSpeechClassifier,
  type SpeechAnalysisMetrics,
} from "../utils/audioSpeechClassifier";
import { registerStream, unRegisterStream } from "../utils/MediaRegistry";

const YAMNET_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite";
const MEDIAPIPE_AUDIO_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@0.10.0/wasm";

const SPEECH_CATEGORIES = new Set([
  "Speech",
  "Conversation",
  "Narration, monologue",
  "Whispering",
  "Babbling",
  "Child speech, kid speaking",
  "Male speech, man speaking",
  "Female speech, woman speaking",
]);

export interface SpeechDetectionEvent {
  reasonTitle: string;
  details: string;
  speechType: string;
  confidence: number;
  rms?: number;
  snrDb?: number;
  transcript?: string;
}

export interface UseSpeechDetectorOptions {
  enabled: boolean;
  existingStream?: MediaStream | null;
  onSpeechDetected?: (event: SpeechDetectionEvent) => void;
}

export interface SpeechDetectorState {
  isSpeaking: boolean;
  audioLevel: number; // 0 to 100
  yamnetReady: boolean;
  lastTranscript: string | null;
}

export function useSpeechDetector({
  enabled,
  existingStream,
  onSpeechDetected,
}: UseSpeechDetectorOptions): SpeechDetectorState {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [yamnetReady, setYamnetReady] = useState(false);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);

  const onSpeechDetectedRef = useRef(onSpeechDetected);
  onSpeechDetectedRef.current = onSpeechDetected;

  const speakingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const yamnetConsecutiveHitsRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setIsSpeaking(false);
      setAudioLevel(0);
      setYamnetReady(false);
      return;
    }

    let isMounted = true;
    let yamnetClassifier: AudioClassifier | null = null;
    let yamnetAudioCtx: AudioContext | null = null;
    let yamnetSource: MediaStreamAudioSourceNode | null = null;
    let yamnetScriptNode: ScriptProcessorNode | null = null;
    let meterAnalyser: AnalyserNode | null = null;
    let meterFrameId: number | null = null;
    let vadClassifier: AudioSpeechClassifier | null = null;
    let recognition: any = null;
    let ownedStream: MediaStream | null = null;
    let lastProcessedTime = 0;

    const markSpeaking = (
      event: SpeechDetectionEvent
    ) => {
      if (!isMounted) return;
      setIsSpeaking(true);
      if (speakingTimeoutRef.current) {
        clearTimeout(speakingTimeoutRef.current);
      }
      speakingTimeoutRef.current = setTimeout(() => {
        if (isMounted) setIsSpeaking(false);
      }, 2200);

      onSpeechDetectedRef.current?.(event);
    };

    const resumeAudioContexts = () => {
      if (yamnetAudioCtx && yamnetAudioCtx.state === "suspended") {
        yamnetAudioCtx.resume().catch(() => {});
      }
    };
    window.addEventListener("click", resumeAudioContexts);
    window.addEventListener("keydown", resumeAudioContexts);

    async function initPipeline() {
      // 1. Obtain active microphone stream
      let activeStream = existingStream;
      if (
        !activeStream ||
        activeStream.getAudioTracks().length === 0 ||
        activeStream.getAudioTracks()[0].readyState === "ended"
      ) {
        try {
          ownedStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: false,
              autoGainControl: true,
            },
          });
          registerStream("SpeechDetector-audio-stream", ownedStream);
          activeStream = ownedStream;
        } catch (err) {
          console.warn("[useSpeechDetector] Failed to acquire microphone:", err);
          return;
        }
      }

      if (!isMounted || !activeStream) return;

      // 2. ViBe MediaCheck Live VU Meter (AnalyserNode fftSize = 256) + 16kHz AudioContext for YAMNet
      try {
        const AudioCtx =
          window.AudioContext || (window as any).webkitAudioContext;
        yamnetAudioCtx = new AudioCtx({ sampleRate: 16000 });
        if (yamnetAudioCtx.state === "suspended") {
          await yamnetAudioCtx.resume().catch(() => {});
        }

        yamnetSource = yamnetAudioCtx.createMediaStreamSource(activeStream);
        meterAnalyser = yamnetAudioCtx.createAnalyser();
        meterAnalyser.fftSize = 256;
        meterAnalyser.smoothingTimeConstant = 0.25;
        yamnetSource.connect(meterAnalyser);

        const freqBins = new Uint8Array(meterAnalyser.frequencyBinCount);
        let lastMeterUpdate = 0;

        const updateMeter = () => {
          if (!isMounted || !meterAnalyser) return;
          const now = performance.now();
          if (now - lastMeterUpdate >= 50) {
            lastMeterUpdate = now;
            meterAnalyser.getByteFrequencyData(freqBins);
            // ViBe's exact formula from media-check.tsx scaled to 0-100
            const avg =
              freqBins.reduce((a, b) => a + b, 0) / freqBins.length / 60;
            const level = Math.min(100, Math.round(avg * 100));
            setAudioLevel(level);
          }
          meterFrameId = requestAnimationFrame(updateMeter);
        };
        meterFrameId = requestAnimationFrame(updateMeter);
      } catch (err) {
        console.warn("[useSpeechDetector] AudioContext setup error:", err);
      }

      // 3. ViBe MediaPipe YAMNet AudioClassifier (16kHz neural speech classification)
      (async () => {
        try {
          const filesetResolver = await FilesetResolver.forAudioTasks(
            MEDIAPIPE_AUDIO_WASM_URL
          );
          if (!isMounted) return;

          yamnetClassifier = await AudioClassifier.createFromOptions(
            filesetResolver,
            {
              baseOptions: { modelAssetPath: YAMNET_MODEL_URL },
            }
          );

          if (!isMounted || !yamnetAudioCtx || !yamnetSource) {
            yamnetClassifier.close();
            return;
          }

          setYamnetReady(true);

          yamnetScriptNode = yamnetAudioCtx.createScriptProcessor(4096, 1, 1);
          yamnetScriptNode.onaudioprocess = (event) => {
            if (!yamnetClassifier || !isMounted) return;
            const now = performance.now();
            if (now - lastProcessedTime < 400) return; // Process every 400ms (ViBe pattern)
            lastProcessedTime = now;

            const audioData = event.inputBuffer.getChannelData(0);
            try {
              const results = yamnetClassifier.classify(audioData, 16000);
              const categories = results[0]?.classifications[0]?.categories;
              if (!categories || categories.length === 0) return;

              // Find highest scoring speech category in top 3 predictions
              const topSpeech = categories
                .slice(0, 3)
                .find(
                  (c) =>
                    SPEECH_CATEGORIES.has(c.categoryName) && c.score >= 0.42
                );

              if (topSpeech) {
                yamnetConsecutiveHitsRef.current += 1;
                // Confirm speech if score is strong (>= 0.52, ViBe threshold is 0.5) or 2 consecutive frames
                if (
                  topSpeech.score >= 0.52 ||
                  yamnetConsecutiveHitsRef.current >= 2
                ) {
                  const score = Number(topSpeech.score.toFixed(2));
                  markSpeaking({
                    reasonTitle: "Speech Detected (MediaPipe Audio AI)",
                    details:
                      topSpeech.categoryName === "Whispering"
                        ? "Whispering detected via microphone"
                        : "Human speech detected via microphone",
                    speechType:
                      topSpeech.categoryName === "Whispering"
                        ? "WHISPER"
                        : "YAMNET_SPEECH",
                    confidence: score,
                  });
                }
              } else {
                yamnetConsecutiveHitsRef.current = 0;
              }
            } catch {
              // Ignore single frame classification error
            }
          };

          // Connect through zero-gain node so microphone audio is not echoed out of speakers
          const silentGain = yamnetAudioCtx.createGain();
          silentGain.gain.value = 0;
          yamnetSource.connect(yamnetScriptNode);
          yamnetScriptNode.connect(silentGain);
          silentGain.connect(yamnetAudioCtx.destination);
        } catch (err) {
          console.info(
            "[useSpeechDetector] MediaPipe YAMNet unavailable, relying on acoustic VAD + WebSpeech:",
            err
          );
        }
      })();

      // 4. Acoustic Formant & Pitch Harmonicity VAD (Works 100% offline with zero external assets)
      try {
        vadClassifier = new AudioSpeechClassifier(activeStream, {
          onSpeechConfirmed: (metrics: SpeechAnalysisMetrics) => {
            if (!isMounted) return;
            const desc =
              metrics.speechType === "QUIET_SPEECH"
                ? "Quiet / low-volume speech detected"
                : metrics.speechType === "WHISPER"
                ? "Whispered speech detected"
                : "Spoken voice detected";
            markSpeaking({
              reasonTitle: "Speech Detected",
              details: desc,
              speechType: metrics.speechType,
              confidence: metrics.confidence,
              rms: metrics.rms,
              snrDb: metrics.snrDb,
            });
          },
        });
        await vadClassifier.start();
      } catch (err) {
        console.warn("[useSpeechDetector] Acoustic VAD init error:", err);
      }

      // 5. Web Speech API Transcription (Captures exact spoken words when supported by browser)
      const SpeechRec =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          recognition = new SpeechRec();
          recognition.continuous = true;
          recognition.interimResults = false;
          recognition.lang = navigator.language || "en-US";
          recognition.maxAlternatives = 1;

          const NON_SPEECH_WORDS = new Set([
            "cough",
            "coughing",
            "sneeze",
            "sneezing",
            "sniff",
            "sigh",
            "yawn",
            "uh",
            "um",
            "ah",
            "oh",
            "eh",
            "hm",
            "hmm",
            "huh",
          ]);

          recognition.onresult = (event: any) => {
            if (!isMounted) return;
            let transcriptText = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const item = event.results[i];
              if (item && item.isFinal && item[0]?.transcript) {
                const conf = item[0].confidence;
                if (conf !== undefined && conf > 0 && conf < 0.45) continue;
                transcriptText += item[0].transcript.trim() + " ";
              }
            }
            transcriptText = transcriptText.trim();
            if (!transcriptText) return;

            const cleaned = transcriptText
              .toLowerCase()
              .replace(/[[\]()]/g, "")
              .trim();
            const meaningful = cleaned
              .split(/\s+/)
              .filter(Boolean)
              .filter((w) => {
                const s = w.replace(/[^a-z0-9]/g, "");
                return s.length >= 2 && !NON_SPEECH_WORDS.has(s);
              });

            if (meaningful.length >= 1) {
              setLastTranscript(transcriptText);
              markSpeaking({
                reasonTitle: "Speech Detected",
                details: `Spoken words detected: "${transcriptText}"`,
                speechType: "TRANSCRIPTION",
                confidence: 0.92,
                transcript: transcriptText,
              });
            }
          };

          recognition.onend = () => {
            if (isMounted && enabled) {
              try {
                recognition.start();
              } catch {}
            }
          };

          recognition.start();
        } catch {
          // Ignore if WebSpeech unavailable
        }
      }
    }

    initPipeline();

    return () => {
      isMounted = false;
      window.removeEventListener("click", resumeAudioContexts);
      window.removeEventListener("keydown", resumeAudioContexts);
      if (speakingTimeoutRef.current) {
        clearTimeout(speakingTimeoutRef.current);
      }
      if (meterFrameId !== null) {
        cancelAnimationFrame(meterFrameId);
      }
      try {
        yamnetScriptNode?.disconnect();
        yamnetSource?.disconnect();
        meterAnalyser?.disconnect();
        yamnetClassifier?.close();
      } catch {}
      if (yamnetAudioCtx && yamnetAudioCtx.state !== "closed") {
        yamnetAudioCtx.close().catch(() => {});
      }
      vadClassifier?.stop();
      if (recognition) {
        try {
          recognition.onend = null;
          recognition.stop();
        } catch {}
      }
      if (ownedStream) {
        unRegisterStream("SpeechDetector-audio-stream");
      }
    };
  }, [enabled, existingStream]);

  return { isSpeaking, audioLevel, yamnetReady, lastTranscript };
}

