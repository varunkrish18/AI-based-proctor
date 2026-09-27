import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api } from "../../api/client";
import { useEventLogger } from "../../hooks/useEventLogger";
import { getTrustedEpochMs, syncTrustedTime } from "../../utils/networkTime";
import { AudioSpeechClassifier, type SpeechAnalysisMetrics } from "../../utils/audioSpeechClassifier";
import type {
  StartExamResponse,
  StudentQuestion,
  AiFrameAnalysisResponse,
} from "../../types";

type AnswerMap = Record<number, number | undefined>;

function checkIsEntireScreen(videoTrack: MediaStreamTrack): { isEntireScreen: boolean; reason?: string } {
  if (!videoTrack) {
    return { isEntireScreen: false, reason: "No video track detected from screen sharing." };
  }

  const settings = videoTrack.getSettings ? videoTrack.getSettings() : ({} as any);
  const trackLabel = (videoTrack.label || "").trim();

  // 1. Standard W3C displaySurface setting check
  if (settings.displaySurface) {
    if (settings.displaySurface === "monitor") {
      return { isEntireScreen: true };
    } else {
      const surfaceType = settings.displaySurface === "browser" ? "Browser Tab" : "Application Window";
      return {
        isEntireScreen: false,
        reason: `Access Denied: You selected a ${surfaceType} instead of 'Entire Screen'. You MUST choose 'Entire Screen' to take the examination.`,
      };
    }
  }

  // 2. Secondary heuristic check if displaySurface is omitted by browser
  const isWindowOrTab = /window|tab|chrome|edge|firefox|opera|brave|application/i.test(trackLabel);
  const isScreenOrDisplay = /screen|monitor|display|entire/i.test(trackLabel);

  if (isWindowOrTab || !isScreenOrDisplay) {
    return {
      isEntireScreen: false,
      reason: `Access Denied: Could not verify Entire Screen sharing (detected: "${trackLabel || "Unknown surface"}"). Please click the 'Entire Screen' tab in the browser dialog.`,
    };
  }

  return { isEntireScreen: true };
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
  const [gazeWarningPopup, setGazeWarningPopup] = useState<{
    direction: "UP" | "DOWN" | "LEFT" | "RIGHT" | "AWAY";
    timestamp: number;
  } | null>(null);
  const [voiceWarningPopup, setVoiceWarningPopup] = useState<{
    message: string;
    speechType?: string;
    confidence?: number;
    timestamp: number;
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
  const [pendingFullscreen, setPendingFullscreen] = useState<boolean>(false);
  const [aiAnalysis, setAiAnalysis] = useState<AiFrameAnalysisResponse | null>(null);
  const [cameraMinimized, setCameraMinimized] = useState<boolean>(false);
  const [entireScreenMissing, setEntireScreenMissing] = useState<boolean>(false);
  const [reacquiringScreen, setReacquiringScreen] = useState<boolean>(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<string>("UNKNOWN");
  const [permissionMissing, setPermissionMissing] = useState<{
    type: "webcam" | "microphone" | "location";
    reason: string;
  } | null>(null);
  const [reacquiringPermissions, setReacquiringPermissions] = useState<boolean>(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [cameraClosedWarning, setCameraClosedWarning] = useState<{ remaining: string; reason: string } | null>(null);

  // Tracks how many times the student has exited fullscreen
  const fullscreenViolationCount = useRef(0);

  const webcamStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const submittedRef = useRef(false);
  const hasRequestedStartRef = useRef(false);
  const cameraClosedStartRef = useRef<number | null>(null);
  const examStartTimeRef = useRef<number>(Date.now());

  // Strike & snapshot tracking refs
  const strikesRef = useRef<number>(0);
  const lookAwayStartRef = useRef<number | null>(null);
  const lookAwaySnappedRef = useRef<boolean>(false);
  const lastGazePopupDismissTime = useRef<number>(0);
  const gazeWarningLoggedRef = useRef<boolean>(false);
  const cameraCoveredStartRef = useRef<number | null>(null);
  const cameraCoveredSnappedRef = useRef<boolean>(false);
  const faceMissingStartRef = useRef<number | null>(null);
  const faceMissingSnappedRef = useRef<boolean>(false);
  const lastStrikeTimeRef = useRef<number>(0);
  const lastPersonBehindPhotoTime = useRef<number>(0);
  const lastObjectPhotoTime = useRef<number>(0);
  const lastVoiceStrikeTimeRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const audioClassifierRef = useRef<AudioSpeechClassifier | null>(null);

  const consecutiveFrameErrors = useRef(0);
  const nextCaptureDelayRef = useRef(1000);

  // Event logging hook (Phase 3)
  const { logEvent, startDurationEvent, flushNow } = useEventLogger(session?.attemptId);

  const connectionTrackerRef = useRef<(() => number) | null>(null);

  // Load exam attempt (guarded against duplicate concurrent mount calls)
  useEffect(() => {
    if (hasRequestedStartRef.current) return;
    hasRequestedStartRef.current = true;

    syncTrustedTime().then(() => {
      api
        .post<StartExamResponse>(`/api/student/exams/${examId}/start`, undefined, "student")
        .then((res) => {
          setSession(res);
          const elapsedSeconds = Math.max(
            0,
            Math.floor((getTrustedEpochMs() - new Date(res.serverStartTime).getTime()) / 1000)
          );
          setRemainingSeconds(Math.max(res.durationMinutes * 60 - elapsedSeconds, 0));

          // If screen is not required, gate passes immediately
          if (res.screenRequired === false) {
            setScreenGatePassed(true);
          }
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    });
  }, [examId]);

  // Keep video elements synchronized with active webcam stream
  useEffect(() => {
    if (webcamStreamRef.current) {
      if (videoRef.current && videoRef.current.srcObject !== webcamStreamRef.current) {
        videoRef.current.srcObject = webcamStreamRef.current;
        videoRef.current.play().catch(() => {});
      }
      if (pipVideoRef.current && pipVideoRef.current.srcObject !== webcamStreamRef.current) {
        pipVideoRef.current.srcObject = webcamStreamRef.current;
        pipVideoRef.current.play().catch(() => {});
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
    if (pipVideoRef.current) {
      pipVideoRef.current.srcObject = null;
    }
    if (bgVideoRef.current) {
      bgVideoRef.current.srcObject = null;
    }
    if (audioClassifierRef.current) {
      audioClassifierRef.current.stop();
      audioClassifierRef.current = null;
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

  const handleSubmit = useCallback(async (autoSubmitReason?: string | React.MouseEvent | unknown) => {
    if (!session || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    const reasonStr = typeof autoSubmitReason === "string" ? autoSubmitReason : undefined;
    try {
      if (reasonStr) {
        await logEvent("EXAM_AUTO_SUBMITTED", undefined, { reason: reasonStr });
      }
      // Flush any queued proctoring events before submission
      await flushNow();
      stopAllMediaStreams();
      // Exit fullscreen cleanly before navigating away
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
      }

      const result: any = await api.post(`/api/student/attempts/${session.attemptId}/submit`, undefined, "student");
      if (reasonStr && result) {
        result.submitReason = reasonStr;
      }
      // Store result so the correction page can read it without re-auth
      sessionStorage.setItem(`exam_result_${examId}`, JSON.stringify(result));
      navigate(`/exam/${examId}/submitted`);
    } catch (e) {
      submittedRef.current = false;
      setError(e instanceof Error ? e.message : "Submission failed.");
      setSubmitting(false);
    }
  }, [session, examId, navigate, flushNow, stopAllMediaStreams, logEvent]);

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

      setGazeWarningPopup(null);
      setVoiceWarningPopup(null);
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

  // Auto-dismiss voice warning popup after 5 seconds
  useEffect(() => {
    if (!voiceWarningPopup) return;
    const t = setTimeout(() => {
      setVoiceWarningPopup(null);
    }, 5000);
    return () => clearTimeout(t);
  }, [voiceWarningPopup]);

  // Auto-dismiss gaze warning popup after 5 seconds
  useEffect(() => {
    if (!gazeWarningPopup) return;
    const t = setTimeout(() => {
      setGazeWarningPopup(null);
    }, 5000);
    return () => clearTimeout(t);
  }, [gazeWarningPopup]);

  // Countdown timer; only runs once screenGatePassed is true
  useEffect(() => {
    if (!session || !screenGatePassed) return;

    const updateRemaining = () => {
      const serverStartMs = new Date(session.serverStartTime).getTime();
      const elapsedSeconds = Math.max(0, Math.floor((getTrustedEpochMs() - serverStartMs) / 1000));
      const left = Math.max(session.durationMinutes * 60 - elapsedSeconds, 0);
      setRemainingSeconds(left);
      if (left <= 0) {
        handleSubmit("Time limit reached");
      }
    };

    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);
    return () => clearInterval(timer);
  }, [session, screenGatePassed, handleSubmit]);

  // Screen share & media acquisition gate
  async function startProctoringAndExam() {
    if (!session) return;
    setGateLoading(true);
    setSetupError(null);

    // 0. Trigger initial fullscreen request immediately while user click gesture is 100% active
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
      } catch (initialFsErr) {
        console.warn("Initial fullscreen request note:", initialFsErr);
      }
    }

    const screenRequired = session.screenRequired ?? true;
    const webcamRequired = session.webcamRequired ?? true;
    const micRequired = session.microphoneRequired ?? true;

    try {
      // 1. Acquire screen capture if required — STRICT ENTIRE SCREEN ENFORCEMENT
      if (screenRequired) {
        if (!navigator.mediaDevices?.getDisplayMedia) {
          throw new Error("Screen sharing is not supported by your browser. Please use Google Chrome, Microsoft Edge, or Mozilla Firefox.");
        }

        let screenStream: MediaStream;
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
        } catch (shareErr: any) {
          if (shareErr.name === "NotAllowedError" || shareErr.name === "PermissionDeniedError" || shareErr.name === "AbortError") {
            throw new Error("Screen sharing permission was cancelled or denied. You cannot access the exam without sharing your Entire Screen.");
          }
          try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({
              video: { displaySurface: "monitor" },
              audio: false,
            } as any);
          } catch {
            throw new Error("Screen sharing is required to access the exam. Please select 'Entire Screen'.");
          }
        }

        const videoTrack = screenStream.getVideoTracks()[0];
        const screenCheck = checkIsEntireScreen(videoTrack);
        if (!screenCheck.isEntireScreen) {
          screenStream.getTracks().forEach((t) => t.stop());
          throw new Error(screenCheck.reason || "You must select 'Entire Screen' to access this examination.");
        }

        screenStreamRef.current = screenStream;
        setScreenStatus("ACTIVE");
        setEntireScreenMissing(false);
        logEvent("SCREEN_SHARE_STARTED", undefined, { label: videoTrack.label, kind: "fullscreen" });

        videoTrack.onended = () => {
          setScreenStatus("LOST");
          setEntireScreenMissing(true);
          logEvent("SCREEN_CAPTURE_STOPPED", undefined, { reason: "User stopped screen share" });
        };
      }

      // 2. Strictly acquire webcam and microphone (Hardware & Permissions required)
      if (webcamRequired || micRequired) {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Webcam and microphone access are required for this exam, but your browser does not support media access in this context. Please ensure you are using HTTPS on Google Chrome, Edge, or Firefox.");
        }
        let userMedia: MediaStream;
        try {
          userMedia = await navigator.mediaDevices.getUserMedia({
            video: webcamRequired
              ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }
              : false,
            audio: micRequired
              ? {
                  echoCancellation: true,
                  noiseSuppression: false,
                  autoGainControl: true,
                }
              : false,
          });
        } catch (mediaErr: any) {
          if (mediaErr.name === "NotAllowedError" || mediaErr.name === "PermissionDeniedError") {
            throw new Error("Camera or Microphone permission was denied in your browser. You must allow Camera and Microphone access in your browser settings to take this exam.");
          }
          if (mediaErr.name === "NotFoundError" || mediaErr.name === "DevicesNotFoundError") {
            throw new Error("No camera or microphone hardware found on your device. Hardware webcam and microphone are strictly mandatory.");
          }
          throw new Error(`Media access error: ${mediaErr.message || "Failed to initialize camera or microphone"}. Permissions must be allowed.`);
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
          userMedia.getVideoTracks().forEach((track) => {
            track.onended = () => {
              setWebcamStatus("LOST");
              logEvent("WEBCAM_LOST", undefined, { reason: "Webcam track ended" });
              setPermissionMissing({ type: "webcam", reason: "Webcam video track disconnected or ended" });
              setWarning("Webcam access lost! Please check camera permissions.");
            };
            track.onmute = () => {
              setWebcamStatus("LOST");
              logEvent("WEBCAM_MUTED", undefined, { reason: "Webcam track muted / privacy button toggled" });
              setPermissionMissing({ type: "webcam", reason: "Camera muted or privacy shutter closed" });
              setWarning("Camera muted or privacy shutter closed!");
            };
            track.onunmute = () => {
              setWebcamStatus("ACTIVE");
              setPermissionMissing((prev) => (prev?.type === "webcam" ? null : prev));
            };
          });
        }

        if (micRequired) {
          setMicStatus("ACTIVE");
          userMedia.getAudioTracks().forEach((track) => {
            track.onended = () => {
              setMicStatus("LOST");
              logEvent("MICROPHONE_LOST", undefined, { reason: "Microphone track ended" });
              setPermissionMissing({ type: "microphone", reason: "Microphone track ended or disconnected" });
              setWarning("Microphone access lost! Please check microphone permissions.");
            };
            track.onmute = () => {
              setMicStatus("LOST");
              logEvent("MICROPHONE_MUTED", undefined, { reason: "Microphone track muted / permission revoked" });
              setPermissionMissing({ type: "microphone", reason: "Microphone muted or permission turned off" });
              setWarning("Microphone muted or permission revoked!");
            };
            track.onunmute = () => {
              setMicStatus("ACTIVE");
              setPermissionMissing((prev) => (prev?.type === "microphone" ? null : prev));
            };
          });
        }
      }

      // 3. Acquire and verify Location
      if (navigator.geolocation) {
        try {
          await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 6000,
              enableHighAccuracy: true,
            });
          });
          setLocationStatus("ACTIVE");
        } catch (locErr: any) {
          if (locErr.code === 1 /* PERMISSION_DENIED */) {
            logEvent("LOCATION_DENIED", undefined, { reason: "Location permission denied" });
            throw new Error("Location permission is mandatory throughout the exam. Please allow Location access in your browser settings.");
          }
          setLocationStatus("ACTIVE");
        }
      }

      // 4. Verify or request fullscreen mode
      const isAlreadyFullscreen = Boolean(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );

      if (isAlreadyFullscreen) {
        examStartTimeRef.current = Date.now();
        setScreenGatePassed(true);
        return;
      }

      // If not yet in fullscreen, try requesting it
      if (document.documentElement.requestFullscreen) {
        try {
          await document.documentElement.requestFullscreen();
          examStartTimeRef.current = Date.now();
          setScreenGatePassed(true);
          return;
        } catch (fsErr) {
          console.warn("Fullscreen request after async media acquisition was deferred:", fsErr);
          // Do NOT stop media streams! All channels (Screen, Webcam, Mic, Location) are verified and active.
          // Prompt user with a single direct click button to enter fullscreen without re-prompting screen share.
          setPendingFullscreen(true);
          return;
        }
      } else {
        examStartTimeRef.current = Date.now();
        setScreenGatePassed(true);
        return;
      }
    } catch (err: any) {
      console.error("Proctoring gate failed:", err);
      stopAllMediaStreams();
      const message =
        err?.message ||
        "Could not verify entire screen sharing and required permissions. Entire screen sharing is mandatory to enter the exam.";
      setSetupError(message);
      setScreenGatePassed(false);
    } finally {
      setGateLoading(false);
    }
  }

  async function reacquireEntireScreen() {
    setReacquiringScreen(true);
    setScreenError(null);
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error("Screen sharing is not supported by your browser.");
      }
      let screenStream: MediaStream;
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
          throw new Error("Screen sharing was cancelled or denied. Please select 'Entire Screen'.");
        }
      }

      const videoTrack = screenStream.getVideoTracks()[0];
      const screenCheck = checkIsEntireScreen(videoTrack);
      if (!screenCheck.isEntireScreen) {
        screenStream.getTracks().forEach((t) => t.stop());
        throw new Error(screenCheck.reason || "You must select 'Entire Screen' to continue.");
      }

      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      screenStreamRef.current = screenStream;
      setScreenStatus("ACTIVE");
      setEntireScreenMissing(false);
      setScreenError(null);
      logEvent("SCREEN_SHARE_STARTED", undefined, { label: videoTrack.label, kind: "fullscreen" });

      videoTrack.onended = () => {
        setScreenStatus("LOST");
        setEntireScreenMissing(true);
        logEvent("SCREEN_CAPTURE_STOPPED", undefined, { reason: "User stopped screen share" });
      };
    } catch (err: any) {
      setScreenError(err?.message || "Failed to share entire screen. Please select 'Entire Screen'.");
      setEntireScreenMissing(true);
    } finally {
      setReacquiringScreen(false);
    }
  }

  async function reacquireMediaPermissions() {
    setReacquiringPermissions(true);
    setPermissionError(null);
    try {
      const webcamRequired = session?.webcamRequired ?? true;
      const micRequired = session?.microphoneRequired ?? true;

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Media devices are not accessible in this browser environment.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: webcamRequired
          ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }
          : false,
        audio: micRequired
          ? { echoCancellation: true, noiseSuppression: false, autoGainControl: true }
          : false,
      });

      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      webcamStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      if (bgVideoRef.current) {
        bgVideoRef.current.srcObject = stream;
        bgVideoRef.current.play().catch(() => {});
      }

      if (webcamRequired) {
        setWebcamStatus("ACTIVE");
        stream.getVideoTracks().forEach((track) => {
          track.onended = () => {
            setWebcamStatus("LOST");
            logEvent("WEBCAM_LOST", undefined, { reason: "Webcam track ended" });
            setPermissionMissing({ type: "webcam", reason: "Webcam video track disconnected or ended" });
          };
          track.onmute = () => {
            setWebcamStatus("LOST");
            logEvent("WEBCAM_MUTED", undefined, { reason: "Webcam track muted / privacy shutter closed" });
            setPermissionMissing({ type: "webcam", reason: "Camera muted or privacy shutter closed" });
          };
          track.onunmute = () => {
            setWebcamStatus("ACTIVE");
            setPermissionMissing((prev) => (prev?.type === "webcam" ? null : prev));
          };
        });
      }

      if (micRequired) {
        setMicStatus("ACTIVE");
        stream.getAudioTracks().forEach((track) => {
          track.onended = () => {
            setMicStatus("LOST");
            logEvent("MICROPHONE_LOST", undefined, { reason: "Microphone track ended" });
            setPermissionMissing({ type: "microphone", reason: "Microphone track disconnected" });
          };
          track.onmute = () => {
            setMicStatus("LOST");
            logEvent("MICROPHONE_MUTED", undefined, { reason: "Microphone track muted / permission turned off" });
            setPermissionMissing({ type: "microphone", reason: "Microphone muted or permission revoked" });
          };
          track.onunmute = () => {
            setMicStatus("ACTIVE");
            setPermissionMissing((prev) => (prev?.type === "microphone" ? null : prev));
          };
        });
      }

      // Re-verify Location
      if (navigator.geolocation) {
        await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        setLocationStatus("ACTIVE");
      }

      setPermissionMissing(null);
      setPermissionError(null);
      setWarning(null);
    } catch (err: any) {
      setPermissionError(
        err?.message || "Failed to restore permissions. Please enable Camera, Microphone, and Location in your browser address bar."
      );
    } finally {
      setReacquiringPermissions(false);
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

    const takeCleanSnapshot = (): string | null => {
      const v = videoRef.current;
      if (!v || v.readyState < 2) return null;
      try {
        const snapCanvas = document.createElement("canvas");
        snapCanvas.width = 320;
        snapCanvas.height = 240;
        const sCtx = snapCanvas.getContext("2d");
        if (!sCtx) return null;
        sCtx.drawImage(v, 0, 0, 320, 240);
        return snapCanvas.toDataURL("image/jpeg", 0.7);
      } catch {
        return null;
      }
    };

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

              // 0. Camera Covered / Occluded Detection (Deliberate obstruction)
              const isCameraCovered =
                res.cameraCovered === true ||
                Boolean(res.events?.some((e) => e.type === "CAMERA_COVERED"));

              if (isCameraCovered) {
                if (!cameraCoveredStartRef.current) {
                  cameraCoveredStartRef.current = Date.now();
                } else {
                  const elapsedMs = Date.now() - cameraCoveredStartRef.current;
                  if (elapsedMs >= 2500 && !cameraCoveredSnappedRef.current) {
                    cameraCoveredSnappedRef.current = true;
                    const photo = takeCleanSnapshot();
                    logEvent("CAMERA_COVERED", Math.round(elapsedMs / 1000), {
                      photo,
                      reason: "Webcam lens is covered or occluded",
                    });
                    flushNow();
                    issueWarningStrike(
                      "Camera Covered / Occluded",
                      "Your webcam appears to be covered or blocked. Keep your camera clear and your face fully visible."
                    );
                  }
                }
              } else {
                cameraCoveredStartRef.current = null;
                cameraCoveredSnappedRef.current = false;
              }

              // 1. Face Missing Detection (Candidate left camera view)
              const isFaceMissing = !res.faceDetected && !isCameraCovered;
              if (isFaceMissing) {
                if (!faceMissingStartRef.current) {
                  faceMissingStartRef.current = Date.now();
                } else {
                  const elapsedMs = Date.now() - faceMissingStartRef.current;
                  if (elapsedMs >= 5000 && !faceMissingSnappedRef.current) {
                    faceMissingSnappedRef.current = true;
                    const photo = takeCleanSnapshot();
                    logEvent("FACE_NOT_VISIBLE", Math.round(elapsedMs / 1000), {
                      photo,
                      durationSeconds: Math.round(elapsedMs / 1000),
                      reason: "Candidate face not detected in webcam view for >= 5s",
                    });
                    flushNow();
                    issueWarningStrike(
                      "Face Not Detected",
                      "Your face has left the camera view for more than 5 seconds. Please remain seated facing your screen."
                    );
                  }
                }
              } else {
                faceMissingStartRef.current = null;
                faceMissingSnappedRef.current = false;
              }

              // 2. Gaze tracking: Looking UP, DOWN, LEFT, RIGHT -> Generate Warning Popup
              // Only triggers when face IS detected and face count is exactly 1
              const isLookingAway = res.faceDetected && res.faceCount === 1 && res.gazeDirection !== "CENTER";
              if (isLookingAway) {
                const dir = (res.gazeDirection || "AWAY") as "UP" | "DOWN" | "LEFT" | "RIGHT" | "AWAY";
                if (!lookAwayStartRef.current) {
                  lookAwayStartRef.current = Date.now();
                  gazeWarningLoggedRef.current = false;
                } else {
                  const elapsedMs = Date.now() - lookAwayStartRef.current;
                  const now = Date.now();

                  // 1. Show warning popup promptly when looking away (UP, DOWN, LEFT, RIGHT)
                  if (
                    elapsedMs >= 800 &&
                    !gazeWarningPopup &&
                    now - lastGazePopupDismissTime.current >= 2500
                  ) {
                    setGazeWarningPopup({ direction: dir, timestamp: now });
                    if (!gazeWarningLoggedRef.current) {
                      gazeWarningLoggedRef.current = true;
                      const eventType =
                        dir === "UP"
                          ? "LOOKING_UP"
                          : dir === "DOWN"
                          ? "LOOKING_DOWN"
                          : dir === "LEFT"
                          ? "LOOKING_LEFT"
                          : dir === "RIGHT"
                          ? "LOOKING_RIGHT"
                          : "LOOKING_AWAY";
                      logEvent(eventType, Math.round(elapsedMs / 1000), {
                        direction: dir,
                        reason: `Candidate looking ${dir.toLowerCase()} away from exam screen`,
                      });
                      flushNow();
                    }
                  }

                  // 2. Continuous look-away for >= 5 seconds takes a clean photo snapshot for proctor review
                  if (elapsedMs >= 5000 && !lookAwaySnappedRef.current) {
                    lookAwaySnappedRef.current = true;
                    const photo = takeCleanSnapshot();
                    logEvent("LOOKING_AWAY_SNAPSHOT", Math.round(elapsedMs / 1000), {
                      photo,
                      direction: dir,
                      durationSeconds: Math.round(elapsedMs / 1000),
                      reason: `Continuous gaze looking ${dir.toLowerCase()} for >= 5 seconds`,
                    });
                    flushNow();
                  }
                }
              } else {
                lookAwayStartRef.current = null;
                lookAwaySnappedRef.current = false;
                gazeWarningLoggedRef.current = false;
              }

              // 2. Secondary person or multiple faces behind candidate: take a photo snapshot
              if (res.personBehindDetected || res.faceCount > 1) {
                const now = Date.now();
                if (now - lastPersonBehindPhotoTime.current >= 6000) {
                  lastPersonBehindPhotoTime.current = now;
                  const photo = takeCleanSnapshot();
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
                  const photo = takeCleanSnapshot();
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

  // 2-Second Camera Closed / Covered Watchdog
  // If camera module is closed (ended, muted, feed stopped)
  // or covered by hand / physical shutter (brightness < 15) for >= 2 seconds continuously,
  // immediately auto-submit the exam!
  useEffect(() => {
    if (!session || !screenGatePassed || submittedRef.current || session.webcamRequired === false) return;

    const intervalId = setInterval(() => {
      if (submittedRef.current) return;

      // Grace period: allow 3.5 seconds after exam start for camera to stabilize
      if (Date.now() - examStartTimeRef.current < 3500) {
        return;
      }

      const stream = webcamStreamRef.current;
      const videoTrack = stream?.getVideoTracks()[0];
      const video = videoRef.current;

      let isClosed = false;
      let reason = "";

      // 1. Camera module hardware / track ended or disconnected
      if (!stream || !videoTrack || videoTrack.readyState === "ended") {
        isClosed = true;
        reason = "Camera module closed or disconnected";
        setWebcamStatus("LOST");
        setPermissionMissing({ type: "webcam", reason: "Camera module closed or disconnected" });
      }
      // 2. Camera hardware privacy shutter / default camera close button muted
      else if (videoTrack.muted) {
        isClosed = true;
        reason = "Camera module closed / hardware privacy button active";
        setWebcamStatus("LOST");
        setPermissionMissing({ type: "webcam", reason: "Camera muted or privacy shutter closed" });
      }
      // 3. Camera track disabled
      else if (!videoTrack.enabled) {
        isClosed = true;
        reason = "Camera video track disabled";
        setWebcamStatus("LOST");
        setPermissionMissing({ type: "webcam", reason: "Camera video track disabled" });
      }
      // 4. Video feed frozen, stopped, or zero dimensions
      else if (!video || video.paused || video.ended || video.videoWidth === 0 || video.readyState < 2) {
        isClosed = true;
        reason = "Camera feed stopped / no video frames";
      }
      // 5. Camera covered by hand or mechanical privacy shutter (black/near-black pixels)
      else if (video && video.readyState >= 2) {
        try {
          const sampleCanvas = document.createElement("canvas");
          sampleCanvas.width = 160;
          sampleCanvas.height = 120;
          const ctx = sampleCanvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, 160, 120);
            const imgData = ctx.getImageData(0, 0, 160, 120).data;
            let totalBrightness = 0;
            let sampleCount = 0;
            for (let i = 0; i < imgData.length; i += 16) {
              totalBrightness += 0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2];
              sampleCount++;
            }
            const avgLuma = sampleCount > 0 ? totalBrightness / sampleCount : 0;
            if (avgLuma < 15) {
              isClosed = true;
              reason = "Camera covered with hand or lens obstructed";
            }
          }
        } catch {
          // ignore canvas read errors
        }
      }

      // 6. Microphone track health check
      const audioTrack = stream?.getAudioTracks()[0];
      if (session?.microphoneRequired !== false) {
        if (!stream || !audioTrack || audioTrack.readyState === "ended" || !audioTrack.enabled || audioTrack.muted) {
          if (micStatus === "ACTIVE") {
            setMicStatus("LOST");
            logEvent("MICROPHONE_LOST", undefined, { reason: "Microphone audio track inactive or muted" });
            setPermissionMissing({ type: "microphone", reason: "Microphone access lost or muted" });
          }
        }
      }

      if (isClosed) {
        if (cameraClosedStartRef.current === null) {
          cameraClosedStartRef.current = Date.now();
        }
        const elapsed = Date.now() - cameraClosedStartRef.current;
        const remainingSec = Math.max(0, (2000 - elapsed) / 1000);
        setCameraClosedWarning({
          remaining: remainingSec.toFixed(1),
          reason,
        });

        if (elapsed >= 2000) {
          console.warn(`[CameraWatchdog] 🚨 Camera closed for >= 2 seconds: ${reason}. Auto-submitting exam!`);
          cameraClosedStartRef.current = null;
          setCameraClosedWarning(null);
          logEvent("CAMERA_CLOSED_AUTO_SUBMIT", undefined, {
            reason,
            durationSeconds: 2,
          });
          flushNow();
          handleSubmit(`Camera module was closed or covered for 2 seconds (${reason}).`);
        }
      } else {
        if (cameraClosedStartRef.current !== null) {
          cameraClosedStartRef.current = null;
          setCameraClosedWarning(null);
        }
      }
    }, 200);

    return () => {
      clearInterval(intervalId);
    };
  }, [session, screenGatePassed, handleSubmit, logEvent, flushNow, micStatus]);

  // Continuous PermissionStatus Listener & Geolocation Watcher
  useEffect(() => {
    if (!session || !screenGatePassed || submittedRef.current) return;

    // 1. Geolocation continuous watcher
    let geoWatchId: number | null = null;
    if (navigator.geolocation) {
      geoWatchId = navigator.geolocation.watchPosition(
        () => {
          setLocationStatus("ACTIVE");
        },
        (err) => {
          if (err.code === 1 /* PERMISSION_DENIED */) {
            setLocationStatus("LOST");
            logEvent("LOCATION_DENIED", undefined, { reason: "Location permission revoked during exam" });
            setPermissionMissing({ type: "location", reason: "Location permission was turned off in browser settings" });
            issueWarningStrike(
              "Location Access Revoked",
              "Location permission was disabled in your browser settings. Location access must remain enabled at all times."
            );
          }
        },
        { enableHighAccuracy: false, maximumAge: 30000, timeout: 20000 }
      );
    }

    // 2. Query permission statuses and listen to immediate onchange
    const permissionCleanups: Array<() => void> = [];

    const watchPerm = async (name: PermissionName, type: "webcam" | "microphone" | "location") => {
      try {
        if (!navigator.permissions?.query) return;
        const pStatus = await navigator.permissions.query({ name });
        const handler = () => {
          if (pStatus.state === "denied") {
            if (type === "webcam") {
              setWebcamStatus("LOST");
              logEvent("WEBCAM_LOST", undefined, { reason: "Camera permission revoked in browser settings" });
              setPermissionMissing({ type: "webcam", reason: "Camera permission was turned off in browser settings" });
              issueWarningStrike(
                "Camera Access Revoked",
                "Camera permission was turned off in your browser settings. Camera monitoring is strictly mandatory."
              );
            } else if (type === "microphone") {
              setMicStatus("LOST");
              logEvent("MICROPHONE_LOST", undefined, { reason: "Microphone permission revoked in browser settings" });
              setPermissionMissing({ type: "microphone", reason: "Microphone permission was turned off in browser settings" });
              issueWarningStrike(
                "Microphone Access Revoked",
                "Microphone permission was turned off in your browser settings. Audio monitoring is strictly mandatory."
              );
            } else if (type === "location") {
              setLocationStatus("LOST");
              logEvent("LOCATION_DENIED", undefined, { reason: "Location permission revoked in browser settings" });
              setPermissionMissing({ type: "location", reason: "Location permission was turned off in browser settings" });
              issueWarningStrike(
                "Location Access Revoked",
                "Location permission was turned off in your browser settings. Location access must remain enabled at all times."
              );
            }
          } else if (pStatus.state === "granted") {
            if (type === "webcam") setWebcamStatus("ACTIVE");
            if (type === "microphone") setMicStatus("ACTIVE");
            if (type === "location") setLocationStatus("ACTIVE");
            setPermissionMissing((prev) => (prev?.type === type ? null : prev));
          }
        };
        pStatus.addEventListener("change", handler);
        permissionCleanups.push(() => pStatus.removeEventListener("change", handler));
      } catch {}
    };

    watchPerm("camera" as any, "webcam");
    watchPerm("microphone" as any, "microphone");
    watchPerm("geolocation" as any, "location");

    return () => {
      if (geoWatchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(geoWatchId);
      }
      permissionCleanups.forEach((fn) => fn());
    };
  }, [session, screenGatePassed, issueWarningStrike, logEvent]);

  // Dual-Layer Voice Detection: Web Speech Recognition (Google Engine) + Web Audio Acoustic Formants
  useEffect(() => {
    const micRequired = session?.microphoneRequired ?? true;
    if (!session || !screenGatePassed || submittedRef.current || !micRequired) return;

    let fallbackStream: MediaStream | null = null;
    let isMounted = true;
    let recognition: any = null;
    let classifier: AudioSpeechClassifier | null = null;

    // Helper: Issue speech warning with debounce, corner popup, and proctor event logging (NEVER terminates exam)
    const triggerSpeechEvent = (
      reasonTitle: string,
      details: string,
      speechType: string,
      confidence: number,
      rmsLevel?: number,
      snrDb?: number,
      transcribedText?: string
    ) => {
      if (!isMounted || submittedRef.current) return;
      const now = Date.now();
      // Debounce speech warnings by 6 seconds to prevent spamming
      if (now - lastVoiceStrikeTimeRef.current < 6000) return;
      lastVoiceStrikeTimeRef.current = now;

      console.warn(`[SpeechDetector] 🎙️ ${reasonTitle}: ${details} (Type: ${speechType}, Conf: ${Math.round(confidence * 100)}%)`);

      const eventPayload = {
        reason: details,
        speechType,
        confidence: Math.round(confidence * 100) / 100,
        rms: rmsLevel !== undefined ? Math.round(rmsLevel * 10) / 10 : undefined,
        snrDb: snrDb !== undefined ? Math.round(snrDb * 10) / 10 : undefined,
        transcript: transcribedText || undefined,
        timestamp: new Date().toISOString(),
      };

      // Dispatches SPEECH_DETECTED and VOICE_DETECTED events to backend proctoring log
      logEvent("SPEECH_DETECTED", undefined, eventPayload);
      logEvent("VOICE_DETECTED", undefined, eventPayload);
      flushNow();

      // Show top-right corner warning popup (Never issues fatal 3-strike terminations on audio)
      setVoiceWarningPopup({
        message: transcribedText ? `Spoken words: "${transcribedText}"` : details,
        speechType,
        confidence,
        timestamp: now,
      });

      // Auto-dismiss popup after 6 seconds if student does not click dismiss
      setTimeout(() => {
        if (isMounted) {
          setVoiceWarningPopup((cur) => (cur?.timestamp === now ? null : cur));
        }
      }, 6000);
    };

    // User gesture handler to ensure AudioContext stays running
    const resumeContext = () => {
      if (audioContextRef.current && audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume().catch(() => {});
      }
    };
    window.addEventListener("click", resumeContext);
    window.addEventListener("keydown", resumeContext);

    // Non-speech vocal sound blacklist (coughs, sneezes, throat clears, breathing, interjections)
    const NON_SPEECH_WORDS = new Set([
      "cough", "coughing", "coughs", "coughed", "coff", "cougher",
      "throat", "clearing", "clear", "cleared", "ahem", "hack", "hacks", "hacking",
      "sneeze", "sneezing", "sneezes", "sneezed",
      "sniff", "sniffing", "snort", "snore", "burp", "hiccup",
      "sigh", "sighing", "sighs",
      "yawn", "yawning", "yawns",
      "gasp", "gasping",
      "groan", "grunt", "grunting",
      "laughter", "laughing", "applause",
      "noise", "sound", "hum", "humming", "click", "thud", "tap",
      // Non-speech fillers
      "uh", "um", "ah", "oh", "eh", "er", "hm", "hmm", "ha", "huh", "tsk", "ach"
    ]);

    // Question indicator keywords for detecting questions asked aloud
    const QUESTION_WORDS = new Set([
      "what", "what's", "whats", "which", "how", "why", "where", "who", "whom", "whose", "when",
      "tell", "explain", "repeat", "answer", "google", "siri", "alexa", "chatgpt"
    ]);

    // =========================================================================
    // LAYER 1: Web Speech Recognition (Google Engine / WebKit Speech)
    // =========================================================================
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRec) {
      try {
        recognition = new SpeechRec();
        recognition.continuous = true;
        recognition.interimResults = false; // Only finalize real speech, never interim guess hallucinations
        recognition.lang = navigator.language || "en-US";
        recognition.maxAlternatives = 1;

        recognition.onresult = (event: any) => {
          if (!isMounted || submittedRef.current) return;
          let transcriptText = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const item = event.results[i];
            if (item && item.isFinal && item[0] && item[0].transcript) {
              const conf = item[0].confidence;
              if (conf !== undefined && conf > 0 && conf < 0.50) continue;
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
            if (NON_SPEECH_WORDS.has(stripped)) return false;
            return stripped.length >= 2;
          });

          // If no meaningful words, or only blacklisted noise tokens, safely ignore
          if (meaningfulWords.length === 0) {
            return;
          }

          // Check if candidate is asking a question:
          const hasQuestionWord = tokens.some((w) => {
            const stripped = w.replace(/[^a-z0-9]/g, "");
            return QUESTION_WORDS.has(stripped);
          });
          const hasQuestionMark = transcriptText.includes("?");
          const isAskingQuestion = (hasQuestionWord || hasQuestionMark) && meaningfulWords.length >= 2;

          // Speech recognized: require at least 3 genuine words or a clear 2+ word question
          if (meaningfulWords.length >= 3 || isAskingQuestion) {
            console.log(`[WebSpeech] 🎙️ Candidate speech detected: "${transcriptText}"`);
            triggerSpeechEvent(
              isAskingQuestion ? "Question Asked Aloud" : "Speech Transcribed",
              isAskingQuestion
                ? `Question asked: "${transcriptText}"`
                : `Spoken phrase: "${transcriptText}"`,
              "TRANSCRIPTION",
              0.92,
              undefined,
              undefined,
              transcriptText
            );
          }
        };

        recognition.onspeechstart = () => {
          if (!isMounted || submittedRef.current) return;
          console.log("[WebSpeech] Acoustic sound onset detected; listening for spoken words...");
        };

        recognition.onerror = (e: any) => {
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
          console.log("[WebSpeech] Engine active and listening for vocal infractions");
        } catch (startErr) {
          console.warn("[WebSpeech] Start error:", startErr);
        }
      } catch (err) {
        console.warn("[WebSpeech] SpeechRecognition init failed:", err);
      }
    }

    // =========================================================================
    // LAYER 2: AudioSpeechClassifier Pipeline (VAD + Pitch Harmonicity + Multi-Band Noise Floor)
    // =========================================================================
    async function initAudioDetection() {
      try {
        let streamToUse: MediaStream | null = webcamStreamRef.current;
        if (!streamToUse || streamToUse.getAudioTracks().length === 0 || !streamToUse.getAudioTracks()[0].enabled) {
          if (!navigator.mediaDevices?.getUserMedia) {
            console.warn("[SpeechDetector] getUserMedia unavailable in this context");
            return;
          }
          try {
            fallbackStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: false,
                autoGainControl: true,
              },
            });
            streamToUse = fallbackStream;
          } catch (micErr) {
            console.warn("[SpeechDetector] Could not acquire audio stream fallback:", micErr);
            return;
          }
        }

        if (!isMounted || !streamToUse || streamToUse.getAudioTracks().length === 0) return;

        // Initialize production AudioSpeechClassifier
        classifier = new AudioSpeechClassifier(streamToUse, {
          onSpeechConfirmed: (metrics: SpeechAnalysisMetrics) => {
            if (!isMounted || submittedRef.current) return;
            const desc =
              metrics.speechType === "QUIET_SPEECH"
                ? "Quiet / low-volume speech detected"
                : metrics.speechType === "WHISPER"
                ? "Whispered speech detected"
                : "Spoken voice detected";
            triggerSpeechEvent(
              "Speech Detected",
              desc,
              metrics.speechType,
              metrics.confidence,
              metrics.rms,
              metrics.snrDb
            );
          },
          onVolumeUpdate: (normalizedLevel: number) => {
            if (isMounted) {
              setMicAudioLevel(normalizedLevel);
            }
          },
        });

        await classifier.start();
        audioClassifierRef.current = classifier;
      } catch (err) {
        console.error("[SpeechDetector] Audio classifier initialization error:", err);
      }
    }

    initAudioDetection();

    return () => {
      isMounted = false;
      classifier?.stop();
      if (audioClassifierRef.current === classifier) {
        audioClassifierRef.current = null;
      }
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
      // Block F11 fullscreen toggle
      if (e.key === "F11") {
        e.preventDefault();
        logEvent("KEYBOARD_SHORTCUT_BLOCKED", undefined, { key: "F11" });
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
      const isFullscreen = Boolean(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );

      if (!isFullscreen) {
        // If candidate exits fullscreen at any point during the exam, TERMINATE immediately!
        // Allow a 1.5-second grace period from exam start time to avoid initial transition race condition
        if (Date.now() - examStartTimeRef.current < 1500) {
          return;
        }

        if (submittedRef.current) return;

        setFullscreenExited(true);
        fullscreenViolationCount.current += 1;

        logEvent("FULLSCREEN_EXIT", undefined, {
          count: fullscreenViolationCount.current,
          action: "EXAM_TERMINATED",
          reason: "Candidate exited fullscreen mode",
        });
        flushNow();

        handleSubmit(
          "Exam Terminated: You exited fullscreen mode during the examination. Fullscreen is strictly mandatory at all times."
        );
      } else {
        setFullscreenExited(false);
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
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    document.addEventListener("mozfullscreenchange", onFullscreenChange);
    document.addEventListener("MSFullscreenChange", onFullscreenChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
      document.removeEventListener("mozfullscreenchange", onFullscreenChange);
      document.removeEventListener("MSFullscreenChange", onFullscreenChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
      stopAllMediaStreams();
    };
  }, [session, screenGatePassed, logEvent, flushNow, stopAllMediaStreams, issueWarningStrike, handleSubmit]);


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
              <p className="font-medium">{setupError}</p>
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
              </div>
            </div>
          )}

          {pendingFullscreen ? (
            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-emerald-800 text-xs flex items-center gap-2">
                <span className="text-base font-bold text-emerald-600">✓</span>
                <span>Entire screen share &amp; media permissions verified. Click below to enter full-screen mode and start your exam.</span>
              </div>
              <button
                onClick={async () => {
                  try {
                    if (document.documentElement.requestFullscreen) {
                      await document.documentElement.requestFullscreen();
                    }
                  } catch (e) {
                    console.warn("Direct fullscreen click note:", e);
                  }
                  examStartTimeRef.current = Date.now();
                  setScreenGatePassed(true);
                  setPendingFullscreen(false);
                }}
                className="w-full bg-emerald-600 text-white font-bold py-3.5 px-6 rounded-lg hover:bg-emerald-700 shadow-md transition-all cursor-pointer text-base active:scale-98"
              >
                Enter Fullscreen &amp; Start Examination →
              </button>
            </div>
          ) : (
            <button
              onClick={startProctoringAndExam}
              disabled={gateLoading}
              className="w-full bg-blue-600 text-white font-medium py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
            >
              {gateLoading ? "Requesting Permissions…" : "Share Entire Screen & Begin Examination"}
            </button>
          )}
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

  // Permission Missing Block Overlay — renders OVER the exam if Camera, Microphone, or Location is lost
  if (permissionMissing) {
    return (
      <div
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-4 select-none backdrop-blur-md"
        style={{ background: "rgba(15, 23, 42, 0.98)" }}
      >
        <div className="bg-slate-900 border-2 border-rose-500 rounded-2xl max-w-lg w-full p-8 text-center shadow-2xl text-white space-y-5 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto text-3xl border border-rose-500/40 animate-pulse">
            {permissionMissing.type === "webcam" ? "📷❌" : permissionMissing.type === "microphone" ? "🎙️❌" : "📍❌"}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">
              {permissionMissing.type === "webcam"
                ? "Camera Access Revoked / Disconnected"
                : permissionMissing.type === "microphone"
                ? "Microphone Access Revoked / Disconnected"
                : "Location Access Revoked / Disconnected"}
            </h2>
            <p className="text-slate-300 text-sm leading-relaxed">
              Examination integrity requires continuous, uninterrupted access to your <strong>Camera, Microphone, and Location</strong>.
              All permissions must remain granted in your browser throughout the entire exam.
            </p>
          </div>
          <div className="bg-rose-950/40 border border-rose-500/30 rounded-lg p-3 text-xs text-rose-200 text-left space-y-1">
            <p className="font-semibold text-rose-300">How to restore permissions &amp; resume exam:</p>
            <ol className="list-decimal list-inside space-y-1 text-slate-300">
              <li>Click the <strong>site settings / lock icon</strong> next to the URL in your browser address bar.</li>
              <li>Set <strong>Camera, Microphone, and Location</strong> to <strong>&quot;Allow&quot;</strong>.</li>
              <li>Click <strong>&quot;Restore Permissions to Resume Exam&quot;</strong> below.</li>
            </ol>
          </div>
          {permissionError && (
            <div className="bg-rose-950/60 border border-rose-500/40 text-rose-300 p-2.5 rounded text-xs font-medium">
              {permissionError}
            </div>
          )}
          <button
            onClick={reacquireMediaPermissions}
            disabled={reacquiringPermissions}
            className="w-full bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg text-base cursor-pointer"
          >
            {reacquiringPermissions ? "Checking Permissions…" : "Restore Permissions to Resume Exam"}
          </button>
        </div>
      </div>
    );
  }

  // Submitting / Exam Terminating Overlay
  if (submitting) {
    return (
      <div
        className="fixed inset-0 z-[10000] flex flex-col items-center justify-center p-4 select-none backdrop-blur-md"
        style={{ background: "rgba(15, 23, 42, 0.98)" }}
      >
        <div className="bg-slate-900 border-2 border-red-500 rounded-2xl max-w-md w-full p-8 text-center shadow-2xl text-white space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto text-3xl border border-red-500/40 animate-pulse">
            🚨
          </div>
          <h2 className="text-2xl font-bold text-white">Submitting &amp; Terminating Exam</h2>
          <p className="text-slate-300 text-sm leading-relaxed">
            {fullscreenExited
              ? "You exited fullscreen mode. Your examination session has been terminated and your recorded answers are being submitted."
              : "Please wait while your answers and proctoring telemetry are safely uploaded to the server..."}
          </p>
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

      {/* Top-Right Notification Container for Gaze & Audio Warning Popups */}
      <div className="fixed top-5 right-5 z-[99999] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        {/* Looking Away (Up, Down, Left, Right) Warning Popup */}
        {gazeWarningPopup && (
          <div className="pointer-events-auto w-full animate-in slide-in-from-top-4 slide-in-from-right-4 fade-in duration-200 shadow-2xl">
            <div className="bg-slate-900/95 backdrop-blur-md border-2 border-amber-400 rounded-2xl shadow-[0_10px_35px_rgba(245,158,11,0.25)] p-4 sm:p-5 text-white">
              <div className="flex items-start gap-3.5">
                {/* Direction Icon Badge */}
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center text-2xl shrink-0 shadow-inner ring-2 ring-amber-400/30 animate-pulse">
                  {gazeWarningPopup.direction === "UP"
                    ? "⬆️"
                    : gazeWarningPopup.direction === "DOWN"
                    ? "⬇️"
                    : gazeWarningPopup.direction === "LEFT"
                    ? "⬅️"
                    : gazeWarningPopup.direction === "RIGHT"
                    ? "➡️"
                    : "👁️"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500 text-slate-950 font-mono shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-950 animate-ping" />
                      Gaze Warning
                    </span>
                    <button
                      onClick={() => {
                        setGazeWarningPopup(null);
                        lastGazePopupDismissTime.current = Date.now();
                      }}
                      className="text-slate-400 hover:text-white text-base leading-none p-1 cursor-pointer font-bold transition-colors"
                      title="Dismiss"
                    >
                      ✕
                    </button>
                  </div>
                  <h4 className="text-sm font-extrabold text-amber-300 leading-snug">
                    Looking {gazeWarningPopup.direction.toUpperCase()} Detected!
                  </h4>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Please keep your eyes and focus directly on your exam screen. Looking {gazeWarningPopup.direction.toLowerCase()} is logged by proctoring.
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[11px] text-amber-400/80 font-medium">Keep eyes on screen</span>
                    <button
                      onClick={() => {
                        setGazeWarningPopup(null);
                        lastGazePopupDismissTime.current = Date.now();
                      }}
                      className="text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-1 px-3 rounded-lg shadow-md cursor-pointer transition-transform active:scale-95"
                    >
                      Keep Focused
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Voice Activity Warning Popup - Top Right Corner */}
        {voiceWarningPopup && (
          <div className="pointer-events-auto w-full animate-in slide-in-from-top-4 slide-in-from-right-4 fade-in duration-200 shadow-2xl">
            <div className="bg-slate-900/95 backdrop-blur-md border-2 border-red-500 rounded-2xl shadow-[0_10px_35px_rgba(239,68,68,0.25)] p-4 sm:p-5 text-white">
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-red-500/20 text-red-400 border border-red-500/40 flex items-center justify-center text-2xl shrink-0 shadow-inner ring-2 ring-red-400/30 animate-pulse">
                  🎙️
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-600 text-white font-mono shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                      Speech Alert
                    </span>
                    <button
                      onClick={() => setVoiceWarningPopup(null)}
                      className="text-slate-400 hover:text-white text-base leading-none p-1 cursor-pointer font-bold transition-colors"
                      title="Dismiss"
                    >
                      ✕
                    </button>
                  </div>
                  <h4 className="text-sm font-extrabold text-red-300 leading-snug">
                    Human Speech Detected!
                  </h4>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    {voiceWarningPopup.message}. Please remain silent during the examination.
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[11px] text-red-400/90 font-mono font-medium">
                      {voiceWarningPopup.speechType
                        ? `${voiceWarningPopup.speechType.replace("_", " ")} ${
                            voiceWarningPopup.confidence
                              ? `(${Math.round(voiceWarningPopup.confidence * 100)}%)`
                              : ""
                          }`
                        : "Silent room required"}
                    </span>
                    <button
                      onClick={() => setVoiceWarningPopup(null)}
                      className="text-xs bg-red-600 hover:bg-red-500 text-white font-bold py-1 px-3 rounded-lg shadow-md cursor-pointer transition-transform active:scale-95"
                    >
                      I Understand
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Critical Camera Closed / Covered Countdown Modal */}
      {cameraClosedWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 sm:p-8 border-4 border-red-600 text-center animate-pulse">
            <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 border-2 border-red-300 flex items-center justify-center text-3xl mx-auto mb-3 shadow-inner">
              📷❌
            </div>
            <span className="inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-red-600 text-white mb-2">
              Security Violation
            </span>
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 mb-2">
              Camera Module Closed or Covered!
            </h3>
            <p className="text-sm text-slate-700 mb-4 font-medium">
              {cameraClosedWarning.reason}
            </p>
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-4">
              <div className="text-xs font-bold text-red-700 uppercase tracking-wide">
                Exam Will Automatically Submit In:
              </div>
              <div className="text-4xl font-black text-red-600 font-mono mt-1">
                {cameraClosedWarning.remaining}s
              </div>
              <div className="text-xs text-red-600 mt-2 font-semibold">
                Uncover your camera lens or open the camera shutter immediately!
              </div>
            </div>
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
            <span className="text-slate-600">|</span>
            <span className="flex items-center gap-1.5" title={`Location: ${locationStatus}`}>
              <span
                className={`w-2 h-2 rounded-full ${
                  locationStatus === "ACTIVE" ? "bg-emerald-400" : "bg-rose-400"
                }`}
              />
              Location
            </span>
          </div>

          {/* AI Focus Indicators (Phase 4 & 5) */}
          {aiAnalysis && (
            <div className="hidden md:flex items-center gap-2.5 text-xs bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
              <span
                className={`flex items-center gap-1 font-medium ${
                  aiAnalysis.cameraCovered
                    ? "text-rose-400 font-bold animate-pulse"
                    : aiAnalysis.faceDetected && aiAnalysis.faceCount === 1
                    ? "text-emerald-400"
                    : "text-amber-400"
                }`}
              >
                {aiAnalysis.cameraCovered
                  ? "🚨 Camera Covered"
                  : aiAnalysis.faceDetected
                  ? aiAnalysis.faceCount > 1
                    ? `👥 ${aiAnalysis.faceCount} Faces`
                    : `👤 Face OK`
                  : "⚠️ No Face"}
              </span>
              <span className="text-slate-600">|</span>
              <span
                className={`flex items-center gap-1 ${
                  aiAnalysis.cameraCovered
                    ? "text-rose-400 font-semibold"
                    : aiAnalysis.gazeDirection === "CENTER"
                    ? "text-slate-300"
                    : "text-amber-400 font-semibold"
                }`}
              >
                👁️ {aiAnalysis.cameraCovered ? "BLOCKED" : aiAnalysis.gazeDirection}
              </span>
            </div>
          )}
        </div>

        <span className="font-mono text-lg font-bold">{mm}:{ss}</span>
        <span className="text-sm text-slate-300">{answeredCount} answered</span>
      </div>

      {/* Persistent warning banner with level-based severity */}
      {warning && (
        <div className={`border-b px-4 py-2.5 text-sm flex items-center justify-center gap-3 shadow-xs transition-colors ${warningStyle}`}>
          <span className="font-medium">{warning}</span>
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
                      ref={pipVideoRef}
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

                    {/* Camera covered warning overlay */}
                    {aiAnalysis?.cameraCovered && (
                      <div className="absolute inset-0 bg-red-950/85 backdrop-blur-xs flex flex-col items-center justify-center p-3 text-center pointer-events-none z-10 animate-pulse">
                        <span className="text-2xl mb-1">🚫</span>
                        <span className="text-xs font-bold text-red-200 tracking-wider">CAMERA COVERED</span>
                        <span className="text-[10px] text-red-300">Uncover your camera lens immediately</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-xs text-slate-500 p-4 text-center">
                    Webcam not required for this exam.
                  </div>
                )}

                {/* Real-time AI Face, Gaze & Object Detection Overlay */}
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none z-20">
                  {aiAnalysis ? (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-md border ${
                        aiAnalysis.cameraCovered
                          ? "bg-rose-600 text-white border-rose-400 font-extrabold animate-pulse"
                          : aiAnalysis.personBehindDetected
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
                      {aiAnalysis.cameraCovered
                        ? "🚨 Camera Covered!"
                        : aiAnalysis.personBehindDetected
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
        </div>
      )}
    </div>
  );
}
