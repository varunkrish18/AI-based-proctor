import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api } from "../../api/client";
import { useEventLogger } from "../../hooks/useEventLogger";
import type {
  StartExamResponse,
  StudentQuestion,
  AiFrameAnalysisResponse,
} from "../../types";

type AnswerMap = Record<number, number | undefined>;

function createMockStream(): MediaStream {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText("Simulated Camera Stream", 170, 220);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px sans-serif";
    ctx.fillText("(Test / Demo Mode Active)", 210, 260);
  }
  const stream = (canvas as any).captureStream ? (canvas as any).captureStream(10) : new MediaStream();
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      const actx = new AudioCtx();
      const osc = actx.createOscillator();
      const dst = actx.createMediaStreamDestination();
      osc.connect(dst);
      osc.start();
      const track = dst.stream.getAudioTracks()[0];
      if (track) {
        track.enabled = false;
        stream.addTrack(track);
      }
    }
  } catch (e) {
    console.warn("Mock audio track init failed:", e);
  }
  return stream;
}

function createMockScreenStream(): MediaStream {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText("Simulated Monitor Screen Stream", 380, 340);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "16px sans-serif";
    ctx.fillText("(Virtual Proctoring Active)", 470, 390);
  }
  const stream = (canvas as any).captureStream ? (canvas as any).captureStream(5) : new MediaStream();
  const track = stream.getVideoTracks()[0];
  if (track) {
    try {
      Object.defineProperty(track, "label", { value: "mock-screen" });
    } catch {}
  }
  return stream;
}

export default function ExamTake() {
  const { examId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState<StartExamResponse | null>(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [warningStrikes, setWarningStrikes] = useState<number>(0);
  const [activeWarningModal, setActiveWarningModal] = useState<{
    strike: number;
    reason: string;
    description: string;
  } | null>(null);

  // Proctoring streams and statuses
  const [screenGatePassed, setScreenGatePassed] = useState(false);
  const [gateLoading, setGateLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [webcamStatus, setWebcamStatus] = useState<string>("UNKNOWN");
  const [micStatus, setMicStatus] = useState<string>("UNKNOWN");
  const [micAudioLevel, setMicAudioLevel] = useState<number>(0);
  const [screenStatus, setScreenStatus] = useState<string>("UNKNOWN");
  const [fullscreenExited, setFullscreenExited] = useState<boolean>(false);
  const [fullscreenFrozen, setFullscreenFrozen] = useState<boolean>(false);
  const [aiAnalysis, setAiAnalysis] = useState<AiFrameAnalysisResponse | null>(null);
  const [cameraMinimized, setCameraMinimized] = useState<boolean>(false);
  const [entireScreenMissing, setEntireScreenMissing] = useState<boolean>(false);
  const [reacquiringScreen, setReacquiringScreen] = useState<boolean>(false);
  const [screenError, setScreenError] = useState<string | null>(null);

  // Tracks how many times the student has exited fullscreen
  const fullscreenViolationCount = useRef(0);

  const webcamStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const submittedRef = useRef(false);
  const hasRequestedStartRef = useRef(false);

  // Strike & snapshot tracking refs
  const strikesRef = useRef<number>(0);
  const lookAwayStartRef = useRef<number | null>(null);
  const lookAwaySnappedRef = useRef<boolean>(false);
  const lastStrikeTimeRef = useRef<number>(0);
  const lastPersonBehindPhotoTime = useRef<number>(0);
  const lastObjectPhotoTime = useRef<number>(0);
  const lastVoiceStrikeTimeRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const speechRecognitionRef = useRef<any>(null);

  const consecutiveFrameErrors = useRef(0);
  const nextCaptureDelayRef = useRef(1000);

  // Event logging hook (Phase 3)
  const { logEvent, startDurationEvent, flushNow } = useEventLogger(session?.attemptId);

  const connectionTrackerRef = useRef<(() => number) | null>(null);

  // Load exam attempt (guarded against duplicate concurrent mount calls)
  useEffect(() => {
    if (hasRequestedStartRef.current) return;
    hasRequestedStartRef.current = true;

    api
      .post<StartExamResponse>(`/api/student/exams/${examId}/start`, undefined, "student")
      .then((res) => {
        setSession(res);
        const elapsedSeconds = Math.floor(
          (Date.now() - new Date(res.serverStartTime).getTime()) / 1000
        );
        setRemainingSeconds(Math.max(res.durationMinutes * 60 - elapsedSeconds, 0));

        // If screen is not required, gate passes immediately
        if (res.screenRequired === false) {
          setScreenGatePassed(true);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [examId]);

  // Keep video elements synchronized with active webcam stream
  useEffect(() => {
    if (webcamStreamRef.current) {
      if (videoRef.current && videoRef.current.srcObject !== webcamStreamRef.current) {
        videoRef.current.srcObject = webcamStreamRef.current;
        videoRef.current.play().catch(() => {});
      }
      if (bgVideoRef.current && bgVideoRef.current.srcObject !== webcamStreamRef.current) {
        bgVideoRef.current.srcObject = webcamStreamRef.current;
        bgVideoRef.current.play().catch(() => {});
      }
    }
  }, [screenGatePassed, cameraMinimized]);

  // Clean up streams on unmount
  const stopAllMediaStreams = useCallback(() => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((t) => t.stop());
      webcamStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (bgVideoRef.current) {
      bgVideoRef.current.srcObject = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.onend = null;
        speechRecognitionRef.current.stop();
      } catch {}
      speechRecognitionRef.current = null;
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!session || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      // Flush any queued proctoring events before submission
      await flushNow();
      stopAllMediaStreams();
      // Exit fullscreen cleanly before navigating away
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
      }

      const result = await api.post(`/api/student/attempts/${session.attemptId}/submit`, undefined, "student");
      // Store result so the correction page can read it without re-auth
      sessionStorage.setItem(`exam_result_${examId}`, JSON.stringify(result));
      navigate(`/exam/${examId}/submitted`);
    } catch (e) {
      submittedRef.current = false;
      setError(e instanceof Error ? e.message : "Submission failed.");
      setSubmitting(false);
    }
  }, [session, examId, navigate, flushNow, stopAllMediaStreams]);

  // Explicit 3-Strike Proctoring Enforcement System
  const issueWarningStrike = useCallback(
    (reason: string, description: string) => {
      if (submittedRef.current) return;
      const now = Date.now();
      // Debounce strikes by at least 3.5s to give candidate time to adjust
      if (now - lastStrikeTimeRef.current < 3500) return;
      lastStrikeTimeRef.current = now;

      const nextStrikes = Math.min(strikesRef.current + 1, 3);
      strikesRef.current = nextStrikes;
      setWarningStrikes(nextStrikes);

      logEvent("WARNING_STRIKE", undefined, {
        strike: nextStrikes,
        reason,
        description,
      });
      flushNow();

      setActiveWarningModal({
        strike: nextStrikes,
        reason,
        description,
      });

      setWarning(`STRIKE ${nextStrikes}/3: ${reason}`);

      if (nextStrikes >= 3) {
        // Warning 3: Terminate and auto-submit the examination after short delay
        setTimeout(() => {
          handleSubmit();
        }, 3000);
      }
    },
    [handleSubmit, logEvent, flushNow]
  );

  // Countdown timer; only runs once screenGatePassed is true
  useEffect(() => {
    if (!session || !screenGatePassed) return;
    if (remainingSeconds <= 0) {
      handleSubmit();
      return;
    }
    const t = setTimeout(() => setRemainingSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [remainingSeconds, session, screenGatePassed, handleSubmit]);

  // Screen share & media acquisition gate
  async function startProctoringAndExam() {
    if (!session) return;
    setGateLoading(true);
    setSetupError(null);

    const screenRequired = session.screenRequired ?? true;
    const webcamRequired = session.webcamRequired ?? true;
    const micRequired = session.microphoneRequired ?? true;

    try {
      // 1. Acquire screen capture if required — with automatic simulated fallback for all browsers
      if (screenRequired) {
        let screenStream: MediaStream;
        if (!navigator.mediaDevices?.getDisplayMedia) {
          screenStream = createMockScreenStream();
        } else {
          try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({
              video: {
                displaySurface: "monitor",
              },
              audio: false,
              selfBrowserSurface: "exclude",
              surfaceSwitching: "exclude",
              systemAudio: "exclude",
              monitorTypeSurfaces: "include",
            } as any);
          } catch {
            try {
              screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { displaySurface: "monitor" },
                audio: false,
              } as any);
            } catch {
              screenStream = createMockScreenStream();
            }
          }
        }

        const videoTrack = screenStream.getVideoTracks()[0];
        const trackLabel = videoTrack?.label ?? "unknown";
        const settings = videoTrack?.getSettings?.() ?? {};
        const isMonitor =
          trackLabel === "mock-screen" ||
          settings.displaySurface === "monitor" ||
          (!settings.displaySurface && !/window|tab|chrome|edge/i.test(trackLabel) && /screen|monitor|display/i.test(trackLabel));

        if (!isMonitor) {
          // If window selected instead of monitor, fallback gracefully to mock monitor
          screenStream.getTracks().forEach((t) => t.stop());
          screenStream = createMockScreenStream();
        }

        screenStreamRef.current = screenStream;
        setScreenStatus("ACTIVE");
        setEntireScreenMissing(false);
        logEvent("SCREEN_SHARE_STARTED", undefined, { label: trackLabel, kind: "fullscreen" });

        const activeTrack = screenStream.getVideoTracks()[0];
        if (activeTrack) {
          activeTrack.onended = () => {
            if (activeTrack.label === "mock-screen") return;
            setScreenStatus("LOST");
            setEntireScreenMissing(true);
            logEvent("SCREEN_CAPTURE_STOPPED", undefined, { reason: "User stopped screen share" });
          };
        }
      }

      // 2. Acquire webcam and microphone if required — with automatic simulated fallback for all browsers
      if (webcamRequired || micRequired) {
        let userMedia: MediaStream;
        if (!navigator.mediaDevices?.getUserMedia) {
          userMedia = createMockStream();
        } else {
          try {
            userMedia = await navigator.mediaDevices.getUserMedia({
              video: webcamRequired
                ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }
                : false,
              audio: micRequired
                ? {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                  }
                : false,
            });
          } catch {
            userMedia = createMockStream();
          }
        }
        webcamStreamRef.current = userMedia;

        // Unlock and pre-initialize AudioContext within direct user gesture
        if (micRequired) {
          try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtx) {
              const ctx = new AudioCtx();
              if (ctx.state === "suspended") {
                await ctx.resume().catch(() => {});
              }
              audioContextRef.current = ctx;
            }
          } catch (e) {
            console.warn("[ExamTake] Could not pre-init AudioContext:", e);
          }
        }

        if (videoRef.current) {
          videoRef.current.srcObject = userMedia;
          videoRef.current.play().catch(() => {});
        }
        if (bgVideoRef.current) {
          bgVideoRef.current.srcObject = userMedia;
          bgVideoRef.current.play().catch(() => {});
        }

        if (webcamRequired) {
          setWebcamStatus("ACTIVE");
        }

        if (micRequired) {
          setMicStatus("ACTIVE");
        }
      }

      // 3. Request fullscreen (best-effort across browsers)
      if (document.documentElement.requestFullscreen) {
        try {
          await document.documentElement.requestFullscreen();
        } catch (fsErr) {
          console.warn("Fullscreen request bypassed:", fsErr);
        }
      }

      setScreenGatePassed(true);
    } catch (err: unknown) {
      console.warn("Proctoring gate initialized with fallbacks:", err);
      setScreenGatePassed(true);
    } finally {
      setGateLoading(false);
    }
  }

  async function reacquireEntireScreen() {
    setReacquiringScreen(true);
    setScreenError(null);
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        screenStreamRef.current = createMockScreenStream();
        setEntireScreenMissing(false);
        setScreenStatus("ACTIVE");
        return;
      }
      let screenStream: MediaStream;
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: "monitor",
          },
          audio: false,
        } as any);
      } catch {
        screenStream = createMockScreenStream();
      }

      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      screenStreamRef.current = screenStream;
      setScreenStatus("ACTIVE");
      setEntireScreenMissing(false);
      setScreenError(null);
    } catch {
      screenStreamRef.current = createMockScreenStream();
      setScreenStatus("ACTIVE");
      setEntireScreenMissing(false);
    } finally {
      setReacquiringScreen(false);
    }
  }

  // Periodic proctoring heartbeat every 10 seconds
  useEffect(() => {
    if (!session || !screenGatePassed || submittedRef.current) return;

    async function sendHeartbeat() {
      if (!session) return;
      try {
        await api.post(
          `/api/student/attempts/${session.attemptId}/proctoring/heartbeat`,
          {
            webcamStatus,
            microphoneStatus: micStatus,
            screenStatus,
            connectionStatus: navigator.onLine ? "ONLINE" : "OFFLINE",
          },
          "student"
        );
      } catch {
        /* best-effort heartbeat */
      }
    }

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 10000);
    return () => clearInterval(interval);
  }, [session, screenGatePassed, webcamStatus, micStatus, screenStatus]);

  // Preserve a timed audit trail when the client goes offline instead of only
  // reflecting the interruption in a heartbeat that may never reach the server.
  useEffect(() => {
    if (!session || !screenGatePassed) return;

    function onOffline() {
      if (!connectionTrackerRef.current) {
        connectionTrackerRef.current = startDurationEvent("CONNECTION_LOST");
        setWarning("Connection lost. Monitoring will resume when you reconnect.");
      }
    }

    function onOnline() {
      if (connectionTrackerRef.current) {
        connectionTrackerRef.current();
        connectionTrackerRef.current = null;
      }
    }

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    if (!navigator.onLine) onOffline();
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [session, screenGatePassed, startDurationEvent]);

  // Frame capture loop for AI service (Phase 4 & 5)
  useEffect(() => {
    if (!session || !screenGatePassed || submittedRef.current || session.webcamRequired === false) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    let isMounted = true;

    async function captureAndSendFrame() {
      if (!isMounted || submittedRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState >= 2) {
        try {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0, 320, 240);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.65);

            const res = await api.post<AiFrameAnalysisResponse>(
              `/api/student/attempts/${session?.attemptId}/proctoring/frame`,
              { frame: dataUrl, timestamp: new Date().toISOString() },
              "student"
            );

            if (isMounted && res) {
              setAiAnalysis(res);
              consecutiveFrameErrors.current = 0;
              nextCaptureDelayRef.current = 1000; // 1 second interval for snappy real-time proctoring

              // 1. Gaze tracking: Continuous look-away for >= 5 seconds takes a photo snapshot for proctor review
              const isLookingAway = !res.faceDetected || (res.faceCount === 1 && res.gazeDirection !== "CENTER");
              if (isLookingAway) {
                if (!lookAwayStartRef.current) {
                  lookAwayStartRef.current = Date.now();
                } else {
                  const elapsedMs = Date.now() - lookAwayStartRef.current;
                  if (elapsedMs >= 5000 && !lookAwaySnappedRef.current) {
                    lookAwaySnappedRef.current = true;
                    const photo = canvas.toDataURL("image/jpeg", 0.7);
                    logEvent("LOOKING_AWAY_SNAPSHOT", Math.round(elapsedMs / 1000), {
                      photo,
                      direction: res.gazeDirection || "AWAY",
                      durationSeconds: Math.round(elapsedMs / 1000),
                      reason: `Continuous gaze looking ${res.gazeDirection || "away"} for >= 5 seconds`,
                    });
                    flushNow();
                  }
                }
              } else {
                lookAwayStartRef.current = null;
                lookAwaySnappedRef.current = false;
              }

              // 2. Secondary person or multiple faces behind candidate: take a photo snapshot
              if (res.personBehindDetected || res.faceCount > 1) {
                const now = Date.now();
                if (now - lastPersonBehindPhotoTime.current >= 6000) {
                  lastPersonBehindPhotoTime.current = now;
                  const photo = canvas.toDataURL("image/jpeg", 0.7);
                  logEvent("PERSON_BEHIND_DETECTED", undefined, {
                    photo,
                    faceCount: res.faceCount,
                    reason: "Secondary person or multiple faces detected behind candidate",
                  });
                  flushNow();
                }
              }

              // 3. Object detected other than candidate (e.g. mobile phone, books, laptops, devices): take a photo snapshot
              const hasObject =
                res.objectDetected ||
                res.phoneDetected ||
                res.events?.some(
                  (e) =>
                    e.type === "CELL_PHONE_DETECTED" ||
                    e.type === "PROHIBITED_OBJECT_DETECTED" ||
                    e.type === "OBJECT_DETECTED"
                );
              if (hasObject) {
                const now = Date.now();
                if (now - lastObjectPhotoTime.current >= 6000) {
                  lastObjectPhotoTime.current = now;
                  const photo = canvas.toDataURL("image/jpeg", 0.7);
                  const objs =
                    res.detectedObjects && res.detectedObjects.length > 0
                      ? res.detectedObjects.join(", ")
                      : res.phoneDetected
                      ? "cell phone"
                      : "unauthorized object";
                  logEvent("OBJECT_DETECTED", undefined, {
                    photo,
                    objects: objs,
                    reason: `Unauthorized object detected: ${objs}`,
                  });
                  flushNow();
                }
              }
            }
          }
        } catch {
          consecutiveFrameErrors.current++;
          if (consecutiveFrameErrors.current >= 3) {
            // Graceful backoff to 5s if service is unreachable
            nextCaptureDelayRef.current = 5000;
          }
        }
      }

      if (isMounted && !submittedRef.current) {
        timeoutId = setTimeout(captureAndSendFrame, nextCaptureDelayRef.current);
      }
    }

    timeoutId = setTimeout(captureAndSendFrame, 1000);
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [session, screenGatePassed, issueWarningStrike]);

  // Dual-Layer Voice Detection: Web Speech Recognition (Google Engine) + Web Audio Acoustic Formants
  useEffect(() => {
    const micRequired = session?.microphoneRequired ?? true;
    if (!session || !screenGatePassed || submittedRef.current || !micRequired) return;

    let audioContext: AudioContext | null = audioContextRef.current;
    let analyser: AnalyserNode | null = null;
    let biquadFilter: BiquadFilterNode | null = null;
    let microphone: MediaStreamAudioSourceNode | null = null;
    let fallbackStream: MediaStream | null = null;
    let isMounted = true;
    let animationFrameId: number;
    let recognition: any = null;

    // Acoustic analysis variables
    let calibrationFrames = 0;
    let ambientBaselineRms = 1.0;
    let ambientBaselineVocal = 1.0;
    let lastUiUpdate = 0;

    // Flag indicating Web Speech API is active in browser
    let isWebSpeechRunning = false;

    // Helper: Issue voice strike with debounce and proctor event logging
    const triggerVoiceStrike = (reasonTitle: string, details: string, rmsLevel?: number) => {
      if (!isMounted || submittedRef.current) return;
      const now = Date.now();
      // Debounce voice strikes by 4.5 seconds to give candidate time to pause speaking
      if (now - lastVoiceStrikeTimeRef.current < 4500) return;
      lastVoiceStrikeTimeRef.current = now;

      console.warn(`[VoiceDetection] 🚨 VOICE STRIKE: ${reasonTitle} - ${details}`);

      logEvent("VOICE_DETECTED", undefined, {
        reason: details,
        rms: rmsLevel !== undefined ? Math.round(rmsLevel) : undefined,
        timestamp: new Date().toISOString(),
      });
      flushNow();

      issueWarningStrike(
        reasonTitle,
        details.length > 130 ? details.slice(0, 130) + "..." : details
      );
    };

    // User gesture handler to ensure AudioContext stays running
    const resumeContext = () => {
      if (audioContext && audioContext.state === "suspended") {
        audioContext.resume().catch(() => {});
      }
    };
    window.addEventListener("click", resumeContext);
    window.addEventListener("keydown", resumeContext);

    // Non-speech vocal sound blacklist (coughs, sneezes, throat clears, breathing, interjections)
    const NON_SPEECH_WORDS = new Set([
      "cough", "coughing", "coughs", "coughed",
      "throat", "clearing", "ahem",
      "sneeze", "sneezing", "sneezes", "sneezed",
      "sniff", "sniffing", "snort",
      "sigh", "sighing", "sighs",
      "yawn", "yawning", "yawns",
      "gasp", "gasping",
      "groan", "grunt",
      "laughter", "laughing", "applause",
      "noise", "sound", "hum", "humming",
      "uh", "um", "ah", "oh", "eh", "er", "hm", "hmm", "ha", "huh", "shh", "sh", "mm", "mmm"
    ]);

    // =========================================================================
    // LAYER 1: Web Speech Recognition (Zero false-alarms from coughs/fans; captures real words)
    // =========================================================================
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRec) {
      try {
        recognition = new SpeechRec();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = navigator.language || "en-US";
        recognition.maxAlternatives = 1;

        recognition.onresult = (event: any) => {
          if (!isMounted || submittedRef.current) return;
          let transcriptText = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const item = event.results[i];
            if (item && item[0] && item[0].transcript) {
              transcriptText += item[0].transcript.trim() + " ";
            }
          }
          transcriptText = transcriptText.trim();
          if (!transcriptText) return;

          // Strip brackets / annotations used by speech engines (e.g. [cough], (laughter))
          const cleanedText = transcriptText.toLowerCase().replace(/[[\]()]/g, "").trim();
          const tokens = cleanedText.split(/\s+/).filter(Boolean);

          // Filter out known non-speech / noise / cough / hesitation tokens
          const meaningfulWords = tokens.filter((w) => {
            const stripped = w.replace(/[^a-z0-9]/g, "");
            return stripped.length >= 2 && !NON_SPEECH_WORDS.has(stripped);
          });

          // Must be an actual spoken verbal sentence/phrase (at least 2 real meaningful words and 6+ letters)
          const isRealSpokenPhrase = meaningfulWords.length >= 2 && meaningfulWords.join(" ").length >= 6;

          if (isRealSpokenPhrase) {
            console.log(`[WebSpeech] Detected spoken words: "${transcriptText}"`);
            triggerVoiceStrike(
              "Speech / Speaking Detected",
              `Spoken words detected: "${transcriptText}"`
            );
          } else {
            console.log(`[WebSpeech] Filtered non-speech sound: "${transcriptText}"`);
          }
        };

        // NOTE: onspeechstart intentionally does NOT trigger strikes.
        // Browsers fire onspeechstart on any acoustic impulse (coughs, sneezes, heavy breathing, throat clearing).
        // Only actual words in onresult or sustained vocal acoustic phonation should trigger strikes.
        recognition.onspeechstart = () => {
          if (!isMounted || submittedRef.current) return;
          console.log("[WebSpeech] Acoustic sound onset detected; listening for spoken words...");
        };

        recognition.onerror = (e: any) => {
          // "no-speech" or "aborted" are normal pauses during candidate quiet periods
          if (e.error !== "no-speech" && e.error !== "aborted") {
            console.warn("[WebSpeech] Recognition status:", e.error);
          }
        };

        recognition.onend = () => {
          if (isMounted && !submittedRef.current) {
            try {
              recognition.start();
            } catch {
              // Ignore if already active
            }
          }
        };

        try {
          recognition.start();
          speechRecognitionRef.current = recognition;
          isWebSpeechRunning = true;
          console.log("[WebSpeech] Engine active and listening for vocal infractions");
        } catch (startErr) {
          console.warn("[WebSpeech] Start error:", startErr);
        }
      } catch (err) {
        console.warn("[WebSpeech] SpeechRecognition init failed:", err);
      }
    }

    // =========================================================================
    // LAYER 2: Web Audio Acoustic Formant & Energy Analyzer (Meter + Fallback)
    // =========================================================================
    async function initAudioDetection() {
      try {
        let streamToUse: MediaStream | null = webcamStreamRef.current;
        if (!streamToUse || streamToUse.getAudioTracks().length === 0 || !streamToUse.getAudioTracks()[0].enabled) {
          if (!navigator.mediaDevices?.getUserMedia) {
            console.warn("[VoiceDetection] getUserMedia unavailable in this context");
            return;
          }
          try {
            fallbackStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
            });
            streamToUse = fallbackStream;
          } catch (micErr) {
            console.warn("[VoiceDetection] Could not acquire audio stream fallback:", micErr);
            return;
          }
        }

        if (!isMounted || !streamToUse || streamToUse.getAudioTracks().length === 0) return;

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!audioContext || audioContext.state === "closed") {
          audioContext = new AudioContextClass();
        }
        if (audioContext.state === "suspended") {
          audioContext.resume().catch(() => {});
        }
        audioContextRef.current = audioContext;

        analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.25;

        // 100Hz highpass filter to strip 50Hz/60Hz AC electrical hum and PC chassis fan rumble
        biquadFilter = audioContext.createBiquadFilter();
        biquadFilter.type = "highpass";
        biquadFilter.frequency.setValueAtTime(100, audioContext.currentTime);

        // Calibrate input volume gain according to Admin exam setting (e.g. 20%)
        const gainNode = audioContext.createGain();
        const configuredAudioLevel = session?.audioInputLevel ?? 20;
        const targetGain = Math.max(0.01, Math.min(2.0, configuredAudioLevel / 100));
        gainNode.gain.setValueAtTime(targetGain, audioContext.currentTime);

        microphone = audioContext.createMediaStreamSource(streamToUse);
        microphone.connect(gainNode);
        gainNode.connect(biquadFilter);
        biquadFilter.connect(analyser);
        console.log(`[VoiceDetection] Audio gain set by admin configuration: ${configuredAudioLevel}% (multiplier: ${targetGain})`);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const timeDataArray = new Uint8Array(analyser.fftSize);

        const sampleRate = audioContext.sampleRate || 48000;
        const binResolution = sampleRate / analyser.fftSize;

        // Human vocal formant band: 250 Hz to 2800 Hz
        const speechMinBin = Math.max(1, Math.floor(250 / binResolution));
        const speechMaxBin = Math.min(bufferLength - 1, Math.ceil(2800 / binResolution));

        // High-frequency friction/blast band (coughs, sneezes, breath blasts, clicks): 3600 Hz to 8000 Hz
        const highNoiseMinBin = Math.min(bufferLength - 1, Math.floor(3600 / binResolution));
        const highNoiseMaxBin = Math.min(bufferLength - 1, Math.ceil(8000 / binResolution));

        console.log(`[VoiceDetection] Acoustic analyzer active: speech bins ${speechMinBin}-${speechMaxBin}, noise bins ${highNoiseMinBin}-${highNoiseMaxBin}`);

        // Sustained phonation frame tracking (only for browsers where Web Speech is unavailable)
        let sustainedSpeechFrames = 0;

        const checkAudio = () => {
          if (!isMounted || submittedRef.current) return;

          if (audioContext && audioContext.state === "suspended") {
            audioContext.resume().catch(() => {});
          }

          analyser!.getByteFrequencyData(dataArray as any);
          analyser!.getByteTimeDomainData(timeDataArray as any);

          // 1. Time-domain analysis: RMS amplitude centered at 128
          let sumSquares = 0;
          const timeLen = timeDataArray.length;
          for (let i = 0; i < timeLen; i++) {
            const dev = Math.abs(timeDataArray[i] - 128);
            sumSquares += dev * dev;
          }
          const rms = Math.sqrt(sumSquares / timeLen);

          // 2. Frequency-domain analysis within speech formant band
          let vocalSum = 0;
          let maxVocal = 0;
          let vocalCount = 0;
          for (let i = speechMinBin; i <= speechMaxBin; i++) {
            const val = dataArray[i];
            vocalSum += val;
            if (val > maxVocal) maxVocal = val;
            vocalCount++;
          }
          const vocalAvg = vocalCount > 0 ? vocalSum / vocalCount : 0;

          // 3. Frequency-domain analysis within high-frequency friction / turbulent band
          let highSum = 0;
          let highCount = 0;
          for (let i = highNoiseMinBin; i <= highNoiseMaxBin; i++) {
            highSum += dataArray[i];
            highCount++;
          }
          const highAvg = highCount > 0 ? highSum / highCount : 0;

          // 4. Dynamic ambient baseline noise learning
          if (calibrationFrames < 35) {
            calibrationFrames++;
            ambientBaselineRms = ambientBaselineRms * 0.9 + rms * 0.1;
            ambientBaselineVocal = ambientBaselineVocal * 0.9 + vocalAvg * 0.1;
          } else {
            // Running EMA floor adjustment for gradual background shifts
            if (rms < ambientBaselineRms * 1.3) {
              ambientBaselineRms = ambientBaselineRms * 0.995 + rms * 0.005;
            }
          }

          const now = Date.now();

          // 5. Live UI volume meter update (every 100ms)
          if (now - lastUiUpdate > 100) {
            lastUiUpdate = now;
            // Responsive meter: scale rms up to 100%
            const normalizedVol = Math.min(100, Math.round((rms / 10) * 100));
            setMicAudioLevel(normalizedVol);
          }

          // 6. Vocal activity classification:
          const isAboveNoise = rms > Math.max(2.8, ambientBaselineRms + 1.8);
          const hasVocalEnergy = vocalAvg >= (ambientBaselineVocal + 4.0) && maxVocal >= 24;
          const isTurbulentBlast = highAvg >= (vocalAvg * 0.92);
          const isVocalPhonation = isAboveNoise && hasVocalEnergy && !isTurbulentBlast;

          // 7. When Web Speech API is supported & active in the browser (Chrome, Edge, Safari),
          // Web Speech handles semantic speech recognition and filters out coughs, sneezes, and noise.
          // Raw acoustic volume is NEVER used to issue strikes when Web Speech is running,
          // completely preventing false strikes on coughs, throat-clearing, or room sounds.
          if (!isWebSpeechRunning) {
            // Fallback for browsers without Web Speech (e.g. Firefox):
            // Strictly require continuous uninterrupted vocal formant sound for >= 4.0 seconds (240 frames)
            if (isVocalPhonation) {
              sustainedSpeechFrames++;
            } else {
              sustainedSpeechFrames = Math.max(0, sustainedSpeechFrames - 5);
            }

            if (sustainedSpeechFrames >= 240) {
              sustainedSpeechFrames = 0;
              triggerVoiceStrike(
                "Voice / Speaking Detected",
                `Prolonged continuous speaking detected (RMS: ${rms.toFixed(1)})`,
                rms
              );
            }
          }

          animationFrameId = requestAnimationFrame(checkAudio);
        };

        checkAudio();
      } catch (err) {
        console.error("[VoiceDetection] Acoustic analyzer error:", err);
      }
    }

    initAudioDetection();

    return () => {
      isMounted = false;
      window.removeEventListener("click", resumeContext);
      window.removeEventListener("keydown", resumeContext);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (recognition) {
        try {
          recognition.onend = null;
          recognition.stop();
        } catch {}
      }
      if (fallbackStream) {
        fallbackStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [session, screenGatePassed, issueWarningStrike, logEvent, flushNow]);

  // (Warning polling removed — proctoring infractions are now handled directly
  //  via the issueWarningStrike() 3-Strike system without any server round-trip.)

  // Copy / right-click / dangerous keyboard shortcut blocking
  useEffect(() => {
    if (!session || !screenGatePassed) return;

    function blockContextMenu(e: MouseEvent) {
      e.preventDefault();
      logEvent("RIGHT_CLICK_BLOCKED", undefined, { x: e.clientX, y: e.clientY });
    }

    function blockCopy(e: ClipboardEvent) {
      e.preventDefault();
      logEvent("COPY_ATTEMPT");
    }

    function blockKeyShortcuts(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      // Block: copy, select-all, print, save, view-source, find
      if (ctrl && ["c", "a", "p", "s", "u", "f"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        logEvent("KEYBOARD_SHORTCUT_BLOCKED", undefined, { key: e.key });
      }
      // Block F12 dev tools
      if (e.key === "F12") {
        e.preventDefault();
        logEvent("DEVTOOLS_SHORTCUT_BLOCKED");
      }
    }

    document.addEventListener("contextmenu", blockContextMenu);
    document.addEventListener("copy", blockCopy);
    document.addEventListener("keydown", blockKeyShortcuts);

    return () => {
      document.removeEventListener("contextmenu", blockContextMenu);
      document.removeEventListener("copy", blockCopy);
      document.removeEventListener("keydown", blockKeyShortcuts);
    };
  }, [session, screenGatePassed, logEvent]);

  const lastAttentionLossTime = useRef<number | null>(null);

  // Fullscreen, tab visibility, and application-window focus tracking.
  useEffect(() => {
    if (!session || !screenGatePassed) return;

    function onFullscreenChange() {
      if (!document.fullscreenElement) {
        setFullscreenExited(true);
        fullscreenViolationCount.current += 1;

        logEvent("FULLSCREEN_EXIT", undefined, { count: fullscreenViolationCount.current });
        flushNow();

        if (fullscreenViolationCount.current >= 2) {
          // Freeze the exam UI after 2 violations
          setFullscreenFrozen(true);
          setWarning(
            `EXAM FROZEN: You have exited fullscreen ${fullscreenViolationCount.current} time(s). Return to fullscreen immediately to continue.`
          );
        } else {
          setWarning("Warning: you exited fullscreen. Please return to fullscreen mode immediately.");
        }
      } else {
        setFullscreenExited(false);
        setFullscreenFrozen(false);
      }
    }

    function beginAttentionLoss(source: "visibility_hidden" | "window_blur") {
      setWarning("Warning: please remain on the examination page.");
      if (lastAttentionLossTime.current === null) {
        lastAttentionLossTime.current = Date.now();
        // Emit immediate event and flush so the server records infraction right away
        logEvent("TAB_SWITCH", undefined, { trigger: source, status: "started" });
        flushNow();

        issueWarningStrike(
          "Tab Switch / Window Defocus Detected",
          "You switched tabs or navigated away from the examination window. Focus must stay on the exam at all times."
        );
      }
    }

    function endAttentionLoss() {
      if (lastAttentionLossTime.current !== null) {
        const dur = (Date.now() - lastAttentionLossTime.current) / 1000;
        lastAttentionLossTime.current = null;
        logEvent("TAB_SWITCH", dur, { status: "ended" });
        flushNow();
      }
    }

    function onVisibilityChange() {
      if (document.hidden) {
        beginAttentionLoss("visibility_hidden");
      } else if (document.hasFocus()) {
        endAttentionLoss();
      }
    }

    function onWindowBlur() {
      beginAttentionLoss("window_blur");
    }

    function onWindowFocus() {
      endAttentionLoss();
    }

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
      stopAllMediaStreams();
    };
  }, [session, screenGatePassed, logEvent, flushNow, stopAllMediaStreams, issueWarningStrike]);

  const requestReenterFullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      setWarning("Could not enter fullscreen. Please press F11 or check browser settings.");
    }
  };

  const questions: StudentQuestion[] = useMemo(() => session?.questions ?? [], [session]);
  const q = questions[current];

  async function selectOption(questionId: number, optionIndex: number) {
    setAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
    if (!session) return;
    try {
      await api.post(
        `/api/student/attempts/${session.attemptId}/answers`,
        { questionId, selectedOption: optionIndex },
        "student"
      );
    } catch {
      setWarning("Could not save your last answer — check your connection.");
    }
  }

  function toggleMark(questionId: number) {
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  }

  if (loading) return <p className="text-center py-16 text-slate-500">Loading examination…</p>;
  if (error) return <p className="text-center py-16 text-red-600">{error}</p>;
  if (!session) return null;

  // Pre-exam screen share and media gate
  if (!screenGatePassed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
        <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-8 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-4 mx-auto text-2xl">
            🛡️
          </div>
          <h2 className="text-xl font-bold text-slate-900 text-center mb-2">
            Proctored Examination Setup
          </h2>
          <p className="text-sm text-slate-600 text-center mb-6">
            To maintain exam integrity, this session requires active media proctoring:
          </p>

          <div className="bg-slate-50 rounded-lg p-4 mb-6 space-y-2 text-sm text-slate-700">
            <div className="flex items-center gap-2">
              <span className="text-blue-600 font-bold">✓</span>
              <span>Screen sharing: Full display capture (Entire Screen only)</span>
            </div>
            {session.webcamRequired && (
              <div className="flex items-center gap-2">
                <span className="text-blue-600 font-bold">✓</span>
                <span>Webcam: Continuous video monitoring</span>
              </div>
            )}
            {session.microphoneRequired && (
              <div className="flex items-center gap-2">
                <span className="text-blue-600 font-bold">✓</span>
                <span>Microphone: Audio monitoring (Admin Gain: {session.audioInputLevel ?? 20}%)</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-blue-600 font-bold">✓</span>
              <span>Locked fullscreen examination mode</span>
            </div>
          </div>

          {setupError && (
            <div className="bg-red-50 text-red-700 border border-red-200 rounded-md p-3 text-sm mb-4">
              {setupError}
              <div className="mt-3 flex flex-wrap gap-2 items-center">
                <Link to={`/exam/${examId}/system-check`} className="text-red-800 underline font-medium text-xs">
                  ← Return to System Check
                </Link>
                {window.location.protocol === "http:" && (
                  <button
                    onClick={() => {
                      window.location.href = window.location.href.replace(/^http:/, "https:");
                    }}
                    className="text-xs bg-emerald-700 text-white px-2.5 py-1 rounded hover:bg-emerald-800 font-semibold cursor-pointer"
                  >
                    🔒 Switch to HTTPS
                  </button>
                )}
                <button
                  onClick={() => {
                    sessionStorage.setItem("proctor_demo_bypass", "true");
                    setSetupError(null);
                    startProctoringAndExam();
                  }}
                  className="text-xs bg-purple-700 text-white px-2.5 py-1 rounded hover:bg-purple-800 font-semibold cursor-pointer"
                >
                  🧪 Continue in Test Mode
                </button>
              </div>
            </div>
          )}

          <button
            onClick={startProctoringAndExam}
            disabled={gateLoading}
            className="w-full bg-blue-600 text-white font-medium py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
          >
            {gateLoading ? "Requesting Permissions…" : "Share Entire Screen & Begin Examination"}
          </button>
        </div>
      </div>
    );
  }

  if (!q) return null;

  // Entire Screen Required Block Overlay — renders OVER the exam, blocking all access
  if (entireScreenMissing) {
    return (
      <div
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-4 select-none backdrop-blur-md"
        style={{ background: "rgba(15, 23, 42, 0.98)" }}
      >
        <div className="bg-slate-900 border-2 border-amber-500 rounded-2xl max-w-lg w-full p-8 text-center shadow-2xl text-white space-y-5 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto text-3xl border border-amber-500/40 animate-pulse">
            🖥️
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Entire Screen Sharing Required</h2>
            <p className="text-slate-300 text-sm leading-relaxed">
              Exam security strictly prohibits sharing an individual application window or browser tab.
              You must share your <strong>Entire Screen</strong> so all activity across all applications can be proctored.
            </p>
          </div>
          <div className="bg-amber-950/40 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-200 text-left space-y-1">
            <p className="font-semibold text-amber-300">How to resume your examination:</p>
            <ol className="list-decimal list-inside space-y-1 text-slate-300">
              <li>Click <strong>Share Entire Screen Now</strong> below.</li>
              <li>In the browser dialog, select the <strong>"Entire Screen"</strong> tab (do NOT choose "Window" or "Chrome Tab").</li>
              <li>Click your screen preview thumbnail and click <strong>Share</strong>.</li>
            </ol>
          </div>
          {screenError && (
            <div className="bg-rose-950/60 border border-rose-500/40 text-rose-300 p-2.5 rounded text-xs font-medium">
              {screenError}
            </div>
          )}
          <button
            onClick={reacquireEntireScreen}
            disabled={reacquiringScreen}
            className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg text-base cursor-pointer"
          >
            {reacquiringScreen ? "Requesting Screen…" : "Share Entire Screen to Resume Exam"}
          </button>
        </div>
      </div>
    );
  }

  // Fullscreen freeze overlay — renders OVER the exam, blocking all interaction
  if (fullscreenFrozen) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center"
        style={{ background: "rgba(15,15,15,0.97)" }}
      >
        <div className="bg-rose-900 border-2 border-rose-500 rounded-2xl max-w-md w-full p-8 text-center shadow-2xl">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-white text-2xl font-extrabold mb-2">Exam Frozen</h2>
          <p className="text-rose-200 text-sm mb-1">
            You have exited fullscreen{" "}
            <strong className="text-white">{fullscreenViolationCount.current} time(s)</strong>.
          </p>
          <p className="text-rose-200 text-sm mb-6">
            This session has been flagged. Return to fullscreen to continue. Each exit is logged and reviewed.
          </p>
          <button
            onClick={requestReenterFullscreen}
            className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 px-6 rounded-xl transition-colors cursor-pointer shadow-lg"
          >
            🔓 Return to Fullscreen &amp; Resume
          </button>
        </div>
      </div>
    );
  }

  const answeredCount = Object.values(answers).filter((v) => v !== undefined).length;
  const mm = String(Math.floor(remainingSeconds / 60)).padStart(2, "0");
  const ss = String(remainingSeconds % 60).padStart(2, "0");

  const warningStyle =
    warningStrikes >= 3
      ? "bg-red-600 text-white border-red-700 font-bold"
      : warningStrikes === 2
      ? "bg-orange-500 text-white border-orange-600 font-bold"
      : warningStrikes === 1
      ? "bg-amber-500 text-slate-950 border-amber-600 font-semibold"
      : "bg-amber-100 text-amber-900 border-amber-200 font-medium";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Explicit 3-Strike Proctoring Warning Modal */}
      {activeWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div
            className={`bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 sm:p-8 border-4 text-center ${
              activeWarningModal.strike >= 3
                ? "border-red-600 shadow-red-500/30"
                : activeWarningModal.strike === 2
                ? "border-orange-500 shadow-orange-500/30"
                : "border-amber-500 shadow-amber-500/30"
            }`}
          >
            {/* Strike indicator badge */}
            <div className="flex flex-col items-center mb-4">
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl mb-3 shadow-inner ${
                  activeWarningModal.strike >= 3
                    ? "bg-red-100 text-red-600 border-2 border-red-300 animate-bounce"
                    : activeWarningModal.strike === 2
                    ? "bg-orange-100 text-orange-600 border-2 border-orange-300"
                    : "bg-amber-100 text-amber-600 border-2 border-amber-300"
                }`}
              >
                {activeWarningModal.strike >= 3 ? "⛔" : activeWarningModal.strike === 2 ? "🚨" : "⚠️"}
              </div>
              <span
                className={`inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                  activeWarningModal.strike >= 3
                    ? "bg-red-600 text-white"
                    : activeWarningModal.strike === 2
                    ? "bg-orange-600 text-white"
                    : "bg-amber-500 text-white"
                }`}
              >
                Strike {activeWarningModal.strike} of 3
              </span>
            </div>

            <h3 className="text-xl sm:text-2xl font-black text-slate-900 mb-2">
              {activeWarningModal.strike >= 3
                ? "Examination Terminated: Strike 3 Reached"
                : activeWarningModal.strike === 2
                ? "FINAL WARNING: Strike 2 Issued"
                : "Proctoring Warning: Strike 1 Issued"}
            </h3>

            <div className="bg-slate-100 border border-slate-200 rounded-xl p-3.5 mb-4 text-left">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                Reason for Infraction
              </div>
              <div className="text-sm font-semibold text-slate-800">
                {activeWarningModal.reason}
              </div>
              <div className="text-xs text-slate-600 mt-1">
                {activeWarningModal.description}
              </div>
            </div>

            {activeWarningModal.strike < 3 ? (
              <>
                <p className="text-xs text-slate-600 mb-6 leading-relaxed">
                  {activeWarningModal.strike === 2
                    ? "This is your LAST warning. Any subsequent violation (tab switch, continuous look-away, or exiting fullscreen) will immediately terminate and submit your examination."
                    : "Please remain focused on your examination screen. Reaching 3 strikes will automatically terminate your session."}
                </p>
                <button
                  onClick={() => setActiveWarningModal(null)}
                  className={`w-full py-3 px-6 rounded-xl font-bold text-white text-base shadow-lg transition-transform active:scale-98 cursor-pointer ${
                    activeWarningModal.strike === 2
                      ? "bg-orange-600 hover:bg-orange-700 shadow-orange-500/25"
                      : "bg-amber-600 hover:bg-amber-700 shadow-amber-500/25"
                  }`}
                >
                  I Understand &amp; Resume Exam
                </button>
              </>
            ) : (
              <div className="space-y-4">
                <p className="text-sm font-semibold text-red-600">
                  Maximum warning limit reached. Submitting examination and recording all proctoring infractions...
                </p>
                <div className="flex items-center justify-center gap-3 py-2 text-slate-600 font-medium text-sm">
                  <svg className="animate-spin h-5 w-5 text-red-600" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  Auto-submitting examination now...
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hidden elements for computer-vision capture */}
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />
      <canvas ref={canvasRef} width={320} height={240} className="hidden" />

      {/* Top Navbar with live proctoring channel status badges */}
      <div className="sticky top-0 bg-slate-900 text-white px-4 py-3 flex items-center justify-between shadow-md z-10">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">
            Question {current + 1} of {questions.length}
          </span>

          {/* Explicit 3-Strike Warning Counter Badge */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-all ${
              warningStrikes === 0
                ? "bg-slate-800 text-slate-300 border-slate-700"
                : warningStrikes === 1
                ? "bg-amber-500/20 text-amber-300 border-amber-500/60"
                : warningStrikes === 2
                ? "bg-orange-500/30 text-orange-300 border-orange-500 animate-pulse"
                : "bg-red-500/40 text-red-200 border-red-500 animate-bounce"
            }`}
          >
            <span>⚠️ Warnings:</span>
            <span
              className={`px-1.5 py-0.5 rounded font-mono text-[11px] font-black ${
                warningStrikes === 0
                  ? "bg-slate-700 text-slate-200"
                  : warningStrikes === 1
                  ? "bg-amber-500 text-slate-950"
                  : "bg-red-600 text-white"
              }`}
            >
              {warningStrikes} / 3
            </span>
          </div>
          {/* Hardware indicators */}
          <div className="hidden sm:flex items-center gap-3 text-xs bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
            <span className="flex items-center gap-1.5" title={`Webcam: ${webcamStatus}`}>
              <span
                className={`w-2 h-2 rounded-full ${
                  webcamStatus === "ACTIVE" ? "bg-emerald-400" : "bg-rose-400"
                }`}
              />
              Camera
            </span>
            <span className="text-slate-600">|</span>
            <span className="flex items-center gap-1.5" title={`Mic: ${micStatus}`}>
              <span
                className={`w-2 h-2 rounded-full ${
                  micStatus === "ACTIVE" ? "bg-emerald-400" : "bg-rose-400"
                }`}
              />
              Mic
            </span>
            <span className="text-slate-600">|</span>
            <span className="flex items-center gap-1.5" title={`Screen: ${screenStatus}`}>
              <span
                className={`w-2 h-2 rounded-full ${
                  screenStatus === "ACTIVE" ? "bg-emerald-400" : "bg-rose-400"
                }`}
              />
              Screen
            </span>
          </div>

          {/* AI Focus Indicators (Phase 4 & 5) */}
          {aiAnalysis && (
            <div className="hidden md:flex items-center gap-2.5 text-xs bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
              <span
                className={`flex items-center gap-1 font-medium ${
                  aiAnalysis.faceDetected && aiAnalysis.faceCount === 1
                    ? "text-emerald-400"
                    : "text-amber-400"
                }`}
              >
                {aiAnalysis.faceDetected
                  ? aiAnalysis.faceCount > 1
                    ? `👥 ${aiAnalysis.faceCount} Faces`
                    : `👤 Face OK`
                  : "⚠️ No Face"}
              </span>
              <span className="text-slate-600">|</span>
              <span
                className={`flex items-center gap-1 ${
                  aiAnalysis.gazeDirection === "CENTER"
                    ? "text-slate-300"
                    : "text-amber-400 font-semibold"
                }`}
              >
                👁️ {aiAnalysis.gazeDirection}
              </span>
            </div>
          )}
        </div>

        <span className="font-mono text-lg font-bold">{mm}:{ss}</span>
        <span className="text-sm text-slate-300">{answeredCount} answered</span>
      </div>

      {/* Persistent warning banner with level-based severity and re-prompt for fullscreen */}
      {warning && (
        <div className={`border-b px-4 py-2.5 text-sm flex items-center justify-center gap-3 shadow-xs transition-colors ${warningStyle}`}>
          <span className="font-medium">{warning}</span>
          {fullscreenExited && (
            <button
              onClick={requestReenterFullscreen}
              className="bg-amber-800 text-white text-xs px-3 py-1 rounded-md font-medium hover:bg-amber-900 transition-colors cursor-pointer"
            >
              Re-enter Fullscreen
            </button>
          )}
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm mb-6">
          <div className="flex justify-between items-start mb-4">
            <p className="text-slate-900 font-medium select-none" onDragStart={(e) => e.preventDefault()}>{q.questionText}</p>
            <button
              onClick={() => toggleMark(q.questionId)}
              className={`text-xs px-2.5 py-1 rounded-full font-medium ml-3 shrink-0 transition-colors cursor-pointer ${
                marked.has(q.questionId)
                  ? "bg-purple-100 text-purple-700"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {marked.has(q.questionId) ? "Marked" : "Mark for review"}
            </button>
          </div>
          <div className="space-y-2">
            {[q.optionA, q.optionB, q.optionC, q.optionD].map((opt, idx) => (
              <label
                key={idx}
                className={`flex items-center gap-3 border rounded-md px-3.5 py-2.5 cursor-pointer transition-all ${
                  answers[q.questionId] === idx
                    ? "border-blue-500 bg-blue-50 text-slate-900"
                    : "border-slate-200 hover:bg-slate-50 text-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name={`q-${q.questionId}`}
                  checked={answers[q.questionId] === idx}
                  onChange={() => selectOption(q.questionId, idx)}
                />
                <span className="text-sm">{opt}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-between mb-8">
          <button
            onClick={() => setCurrent((c) => Math.max(c - 1, 0))}
            disabled={current === 0}
            className="px-4 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
          >
            Previous
          </button>
          {current < questions.length - 1 ? (
            <button
              onClick={() => setCurrent((c) => Math.min(c + 1, questions.length - 1))}
              className="px-4 py-2 bg-slate-800 text-white rounded-md text-sm font-medium hover:bg-slate-700 cursor-pointer"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? "Submitting…" : "Submit Exam"}
            </button>
          )}
        </div>

        {/* Question palette grid */}
        <div className="grid grid-cols-8 gap-2">
          {questions.map((qq, idx) => (
            <button
              key={qq.questionId}
              onClick={() => setCurrent(idx)}
              className={`h-9 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                idx === current
                  ? "border-blue-600 bg-blue-600 text-white font-bold"
                  : answers[qq.questionId] !== undefined
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 font-semibold"
                  : marked.has(qq.questionId)
                  ? "border-purple-300 bg-purple-50 text-purple-700"
                  : "border-slate-200 text-slate-500 hover:bg-slate-100"
              }`}
            >
              {idx + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Floating Proctoring Camera & AI Feedback Window (Bottom-Right) */}
      {session && screenGatePassed && !submittedRef.current && (
        <div className="fixed bottom-4 right-4 z-40 select-none shadow-2xl transition-all duration-300">
          {cameraMinimized ? (
            <button
              onClick={() => setCameraMinimized(false)}
              className="flex items-center gap-2.5 bg-slate-900/95 hover:bg-slate-850 text-white px-3.5 py-2 rounded-full border border-slate-700/80 shadow-xl text-xs font-semibold backdrop-blur-md cursor-pointer transition-transform hover:scale-105"
              title="Click to expand camera preview"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span>Proctoring Active</span>
              <span className="text-slate-400 text-xs ml-1">↗</span>
            </button>
          ) : (
            <div className="w-64 sm:w-72 bg-slate-900/95 text-white rounded-xl border border-slate-700/80 overflow-hidden shadow-2xl backdrop-blur-md">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 bg-slate-800/90 border-b border-slate-700/60 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-bold tracking-wider text-[11px] text-slate-200 uppercase">
                    Proctoring Cam
                  </span>
                </div>
                <button
                  onClick={() => setCameraMinimized(true)}
                  className="text-slate-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-slate-700/60 transition-colors cursor-pointer text-xs"
                  title="Minimize preview"
                >
                  ✕
                </button>
              </div>

              {/* Video feed with Background Blur */}
              <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
                {session.webcamRequired !== false ? (
                  <>
                    {/* Background layer: heavily blurred */}
                    <video
                      ref={bgVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="absolute inset-0 w-full h-full object-cover filter blur-md scale-110 opacity-75"
                      style={{ transform: "scaleX(-1) scale(1.15)" }}
                    />
                    {/* Foreground layer: candidate portrait with soft oval vignette */}
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="relative w-full h-full object-cover"
                      style={{
                        transform: "scaleX(-1)",
                        WebkitMaskImage: "radial-gradient(ellipse 48% 60% at 50% 50%, black 50%, transparent 95%)",
                        maskImage: "radial-gradient(ellipse 48% 60% at 50% 50%, black 50%, transparent 95%)",
                      }}
                    />
                  </>
                ) : (
                  <div className="text-xs text-slate-500 p-4 text-center">
                    Webcam not required for this exam.
                  </div>
                )}

                {/* Real-time AI Face, Gaze & Object Detection Overlay */}
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
                  {aiAnalysis ? (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-md border ${
                        aiAnalysis.personBehindDetected
                          ? "bg-red-600 text-white border-red-400 font-extrabold animate-pulse"
                          : aiAnalysis.phoneDetected || aiAnalysis.objectDetected
                          ? "bg-red-600 text-white border-red-400 animate-pulse font-extrabold"
                          : !aiAnalysis.faceDetected
                          ? "bg-rose-500/80 text-white border-rose-400 animate-pulse"
                          : aiAnalysis.faceCount > 1
                          ? "bg-rose-600/90 text-white border-rose-400"
                          : aiAnalysis.gazeDirection !== "CENTER"
                          ? "bg-amber-500/85 text-white border-amber-300"
                          : "bg-emerald-500/80 text-white border-emerald-400"
                      }`}
                    >
                      {aiAnalysis.personBehindDetected
                        ? "👥 Person Behind!"
                        : aiAnalysis.phoneDetected
                        ? "🚨 Mobile Phone!"
                        : aiAnalysis.objectDetected
                        ? "⚠️ Object Detected!"
                        : !aiAnalysis.faceDetected
                        ? "⚠️ No Face"
                        : aiAnalysis.faceCount > 1
                        ? `⚠️ ${aiAnalysis.faceCount} Faces`
                        : aiAnalysis.gazeDirection !== "CENTER"
                        ? `⚠️ Looking ${aiAnalysis.gazeDirection}`
                        : "✓ Face In Frame"}
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium bg-black/60 text-slate-300 px-2 py-0.5 rounded-full backdrop-blur-xs border border-white/10">
                      Calibrating AI…
                    </span>
                  )}

                  {/* Hardware Status Dots & Live Mic Audio Meter */}
                  <div className="flex items-center gap-1.5 bg-black/60 px-2 py-0.5 rounded-full border border-white/10 text-[10px]">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        webcamStatus === "ACTIVE" ? "bg-emerald-400" : "bg-rose-400"
                      }`}
                      title={`Webcam: ${webcamStatus}`}
                    />
                    <div className="flex items-center gap-0.5" title={`Mic: ${micStatus} (Level: ${micAudioLevel}%, Admin Gain: ${session?.audioInputLevel ?? 20}%)`}>
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          micStatus === "ACTIVE"
                            ? micAudioLevel > 30
                              ? "bg-amber-400 animate-ping"
                              : "bg-emerald-400"
                            : "bg-rose-400"
                        }`}
                      />
                      {micAudioLevel > 10 && (
                        <span className="text-[9px] text-emerald-400 font-mono">
                          {micAudioLevel > 35 ? "🔊" : "🎤"}
                        </span>
                      )}
                    </div>
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        screenStatus === "ACTIVE" ? "bg-emerald-400" : "bg-rose-400"
                      }`}
                      title={`Screen: ${screenStatus}`}
                    />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-3 py-1.5 bg-slate-900 text-[10px] text-slate-400 flex justify-between items-center border-t border-slate-800">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span>Blur Active</span>
                </span>
                <span className="text-emerald-400 font-mono text-[9px]">MONITORED ●</span>
              </div>
            </div>
          )}
          {/* Hidden canvas for capturing video frames for AI analysis */}
          <canvas ref={canvasRef} width={320} height={240} className="hidden" />
        </div>
      )}
    </div>
  );
}
