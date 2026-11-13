import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { checkIsMobileDevice } from "../../utils/deviceDetector";
import { runProctoringChecks } from "../../utils/proctoringGuard";
import { registerStream, unRegisterStream } from "../../utils/MediaRegistry";
import { useFaceDetector } from "../../hooks/useFaceDetector";

type CheckStatus = "pending" | "checking" | "ok" | "fail" | "not_required";

interface CheckItem {
  key: string;
  label: string;
  status: CheckStatus;
  detail?: string;
  fixHint?: string;
  isHardware?: boolean;
}

interface ExamRequirements {
  webcamRequired: boolean;
  microphoneRequired: boolean;
  screenRequired: boolean;
  locationRequired: boolean;
}

const initialChecks: CheckItem[] = [
  {
    key: "device",
    label: "Desktop / Laptop hardware check",
    status: "pending",
    fixHint: "Mobile devices and tablets are strictly prohibited, even in desktop mode. Use a Laptop or Desktop PC.",
  },
  {
    key: "browser",
    label: "Browser compatibility",
    status: "pending",
    fixHint: "Supported in Google Chrome, Microsoft Edge, Mozilla Firefox, and Apple Safari.",
  },
  {
    key: "internet",
    label: "Internet connection",
    status: "pending",
    fixHint: "Check your network connection and try again.",
  },
  {
    key: "fullscreen",
    label: "Fullscreen capability",
    status: "pending",
    fixHint: "Your browser will enter fullscreen mode when the exam starts.",
  },
  {
    key: "webcam",
    label: "Webcam access & anti-spoofing check",
    status: "pending",
    isHardware: true,
    fixHint: "Click the site permissions / lock icon next to the URL in your browser address bar, turn on Camera (use a physical webcam, not a virtual camera), and click 'Re-run Checks'.",
  },
  {
    key: "microphone",
    label: "Microphone access & live audio check",
    status: "pending",
    isHardware: true,
    fixHint: "Click the site permissions / lock icon next to the URL in your browser address bar, turn on Microphone, and click 'Re-run Checks'.",
  },
  {
    key: "location",
    label: "Location access",
    status: "pending",
    isHardware: true,
    fixHint: "Click the site permissions / lock icon next to the URL in your browser address bar, turn on Location, and click 'Re-run Checks'.",
  },
  {
    key: "screen",
    label: "Screen sharing support",
    status: "pending",
    isHardware: true,
    fixHint: "Screen share will be requested once the exam starts (you must select 'Entire Screen').",
  },
];

export default function SystemCheck() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [checks, setChecks] = useState<CheckItem[]>(initialChecks);
  const [running, setRunning] = useState(false);
  const [expandedFix, setExpandedFix] = useState<string | null>(null);

  // ViBe MediaCheck live preview & audio VU meter state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const [hasLiveVideo, setHasLiveVideo] = useState(false);
  const [hasLiveAudio, setHasLiveAudio] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [cameraLabel, setCameraLabel] = useState<string>("");
  const [micLabel, setMicLabel] = useState<string>("");

  const [requirements, setRequirements] = useState<ExamRequirements>(() => {
    try {
      const cached = sessionStorage.getItem(`exam_proctoring_${examId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          webcamRequired: parsed.webcamRequired ?? true,
          microphoneRequired: parsed.microphoneRequired ?? true,
          screenRequired: parsed.screenRequired ?? true,
          locationRequired: parsed.locationRequired ?? false,
        };
      }
    } catch {}
    return {
      webcamRequired: true,
      microphoneRequired: true,
      screenRequired: true,
      locationRequired: false,
    };
  });

  // Run ViBe client-side TensorFlow.js face + head pose + blur detector on the live preview
  const faceState = useFaceDetector(
    videoRef,
    hasLiveVideo && requirements.webcamRequired
  );

  const stopPreviewStreams = useCallback(() => {
    unRegisterStream("SystemCheck-video");
    unRegisterStream("SystemCheck-audio");
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach((t) => t.stop());
      previewStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setHasLiveVideo(false);
    setHasLiveAudio(false);
    setMicLevel(0);
  }, []);

  useEffect(() => {
    return () => {
      stopPreviewStreams();
    };
  }, [stopPreviewStreams]);

  // ViBe MediaCheck real-time microphone VU meter (AnalyserNode fftSize = 256)
  useEffect(() => {
    if (!hasLiveAudio || !previewStreamRef.current) {
      setMicLevel(0);
      return;
    }
    const audioTracks = previewStreamRef.current.getAudioTracks();
    if (audioTracks.length === 0) return;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    let ctx: AudioContext | null = null;
    let frameId = 0;

    try {
      ctx = new AudioCtx();
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const audioOnlyStream = new MediaStream(audioTracks);
      ctx.createMediaStreamSource(audioOnlyStream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        const normalized = Math.min(
          1,
          data.reduce((a, b) => a + b, 0) / data.length / 60
        );
        setMicLevel(Math.round(normalized * 100));
        frameId = requestAnimationFrame(tick);
      };
      frameId = requestAnimationFrame(tick);
    } catch {
      // Ignore AudioContext errors
    }

    return () => {
      cancelAnimationFrame(frameId);
      if (ctx && ctx.state !== "closed") {
        void ctx.close().catch(() => {});
      }
    };
  }, [hasLiveAudio]);

  // Fetch official proctoring requirements from backend to guarantee latest config
  useEffect(() => {
    if (!examId) return;
    api
      .get<any>(`/api/exams/${examId}`)
      .then((data) => {
        if (data) {
          const updated: ExamRequirements = {
            webcamRequired: data.webcamRequired ?? true,
            microphoneRequired: data.microphoneRequired ?? true,
            screenRequired: data.screenRequired ?? true,
            locationRequired: data.locationRequired ?? false,
          };
          setRequirements(updated);
          sessionStorage.setItem(
            `exam_proctoring_${examId}`,
            JSON.stringify(updated)
          );
        }
      })
      .catch(() => {});
  }, [examId]);

  const isSecure =
    typeof window !== "undefined" &&
    (window.isSecureContext === true ||
      window.location.protocol === "https:" ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  function update(key: string, status: CheckStatus, detail?: string) {
    setChecks((prev) =>
      prev.map((c) => (c.key === key ? { ...c, status, detail } : c))
    );
  }

  async function runChecks() {
    setRunning(true);
    setExpandedFix(null);
    stopPreviewStreams();
    setChecks((prev) =>
      prev.map((c) => ({
        ...c,
        status: "checking" as CheckStatus,
        detail: undefined,
      }))
    );

    // 0. Hardware device check (Prevent mobile / tablets even in desktop mode)
    const mobileCheck = checkIsMobileDevice();
    if (mobileCheck.isMobile) {
      update(
        "device",
        "fail",
        `Mobile / tablet prohibited: ${mobileCheck.reason || "Touch mobile device"}`
      );
    } else {
      update("device", "ok", "Desktop / Laptop computer verified");
    }

    // 1. Browser API compatibility
    update("browser", "ok", "Supported browser environment");

    // 2. Internet connectivity
    if (navigator.onLine) {
      update("internet", "ok", "Active internet connection detected");
    } else {
      update("internet", "fail", "No internet connection detected");
    }

    // 3. Fullscreen check
    if (document.fullscreenEnabled) {
      update("fullscreen", "ok", "Fullscreen mode supported");
    } else {
      update(
        "fullscreen",
        "fail",
        "Fullscreen mode not supported or disabled in browser"
      );
    }

    const combinedTracks: MediaStreamTrack[] = [];

    // 4. Camera check + ViBe Virtual Camera & Quality Guard + Live Preview
    if (!requirements.webcamRequired) {
      update(
        "webcam",
        "not_required",
        "Not required for this exam — camera permission not collected"
      );
    } else {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("MEDIA_UNAVAILABLE");
        }
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        });

        // Run ViBe virtual camera & stream quality checks
        const violations = await runProctoringChecks(videoStream);
        if (violations.length > 0) {
          videoStream.getTracks().forEach((t) => t.stop());
          update("webcam", "fail", violations[0].reason);
        } else {
          registerStream("SystemCheck-video", videoStream);
          const vTrack = videoStream.getVideoTracks()[0];
          setCameraLabel(vTrack?.label || "Hardware Webcam");
          combinedTracks.push(...videoStream.getVideoTracks());
          setHasLiveVideo(true);
          update(
            "webcam",
            "ok",
            `Hardware camera verified (${vTrack?.label || "Active"})`
          );
        }
      } catch (err: any) {
        const isDenied =
          err?.name === "NotAllowedError" ||
          err?.name === "PermissionDeniedError";
        update(
          "webcam",
          "fail",
          isDenied
            ? "Camera permission denied in browser settings"
            : "Camera hardware not detected or in use by another app"
        );
      }
    }

    // 5. Microphone check + ViBe Live Audio VU Meter
    if (!requirements.microphoneRequired) {
      update(
        "microphone",
        "not_required",
        "Not required for this exam — microphone permission not collected"
      );
    } else {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("MEDIA_UNAVAILABLE");
        }
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: true,
          },
        });
        registerStream("SystemCheck-audio", audioStream);
        const aTrack = audioStream.getAudioTracks()[0];
        setMicLabel(aTrack?.label || "Hardware Microphone");
        combinedTracks.push(...audioStream.getAudioTracks());
        setHasLiveAudio(true);
        update(
          "microphone",
          "ok",
          `Microphone active (${aTrack?.label || "Ready"}) — speak to test level below`
        );
      } catch (err: any) {
        const isDenied =
          err?.name === "NotAllowedError" ||
          err?.name === "PermissionDeniedError";
        update(
          "microphone",
          "fail",
          isDenied
            ? "Microphone permission denied in browser settings"
            : "Microphone hardware not detected or unavailable"
        );
      }
    }

    if (combinedTracks.length > 0) {
      const combined = new MediaStream(combinedTracks);
      previewStreamRef.current = combined;
      if (videoRef.current && combined.getVideoTracks().length > 0) {
        videoRef.current.srcObject = combined;
        videoRef.current.play().catch(() => {});
      }
    }

    // 6. Location check - Only collect if location is required
    if (!requirements.locationRequired) {
      update(
        "location",
        "not_required",
        "Not required for this exam — location permission not collected"
      );
    } else {
      try {
        if (!navigator.geolocation) {
          throw new Error("GEOLOCATION_UNAVAILABLE");
        }
        await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 6000,
            enableHighAccuracy: true,
          })
        );
        update("location", "ok", "Location access granted & verified");
      } catch (err: any) {
        const isDenied =
          err?.code === 1 ||
          err?.name === "NotAllowedError" ||
          err?.name === "PermissionDeniedError";
        update(
          "location",
          "fail",
          isDenied
            ? "Location permission denied in browser settings"
            : "Location access timed out or unavailable"
        );
      }
    }

    // 7. Screen share check - Only collect if screen share required
    if (!requirements.screenRequired) {
      update("screen", "not_required", "Not required for this exam");
    } else {
      if (
        Boolean(
          navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices
        )
      ) {
        update("screen", "ok", "Hardware screen share ready");
      } else {
        update(
          "screen",
          "fail",
          "Screen sharing not supported by this browser"
        );
      }
    }

    setRunning(false);
  }

  // Ensure video element attaches stream whenever hasLiveVideo toggles on
  useEffect(() => {
    if (hasLiveVideo && videoRef.current && previewStreamRef.current) {
      videoRef.current.srcObject = previewStreamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [hasLiveVideo]);

  function switchToHttps() {
    const currentUrl = window.location.href;
    if (currentUrl.startsWith("http://")) {
      window.location.href = currentUrl.replace(/^http:/, "https:");
    }
  }

  useEffect(() => {
    runChecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirements]);

  // Listen to browser permission state changes
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query)
      return;

    const cleanupFns: Array<() => void> = [];

    const watch = async (name: PermissionName) => {
      try {
        const pStatus = await navigator.permissions.query({ name });
        const onPermChange = () => {
          runChecks();
        };
        pStatus.addEventListener("change", onPermChange);
        cleanupFns.push(() =>
          pStatus.removeEventListener("change", onPermChange)
        );
      } catch {}
    };

    if (requirements.webcamRequired) watch("camera" as any);
    if (requirements.microphoneRequired) watch("microphone" as any);
    if (requirements.locationRequired) watch("geolocation" as any);

    return () => {
      cleanupFns.forEach((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirements]);

  const activeRequiredChecks = useMemo(() => {
    return checks.filter((c) => {
      if (c.key === "webcam") return requirements.webcamRequired;
      if (c.key === "microphone") return requirements.microphoneRequired;
      if (c.key === "location") return requirements.locationRequired;
      if (c.key === "screen") return requirements.screenRequired;
      return true;
    });
  }, [checks, requirements]);

  const allRequiredOk = activeRequiredChecks.every(
    (c) => c.status === "ok" || c.status === "not_required"
  );
  const stillChecking = checks.some(
    (c) => c.status === "checking" || c.status === "pending"
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-xl font-bold text-slate-900 mb-1">
        System &amp; Environment Diagnostics
      </h1>
      <p className="text-slate-500 text-xs mb-6">
        This check confirms browser compatibility, camera framing, and live
        microphone input before your exam session begins.
      </p>

      {/* Helpful HTTPS Recommendation Banner if on HTTP (Non-blocking) */}
      {!isSecure &&
        (requirements.webcamRequired || requirements.microphoneRequired) && (
          <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50/80 p-4 text-blue-900 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="text-2xl mt-0.5">ℹ️</span>
              <div className="flex-1">
                <h3 className="font-bold text-xs text-blue-950">
                  Tip for Full Hardware Camera &amp; Microphone Tracking
                </h3>
                <p className="mt-1 text-xs text-blue-800 leading-relaxed">
                  Browser security requires HTTPS for camera, microphone, and
                  location access:
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    onClick={switchToHttps}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold text-xs hover:bg-blue-700 transition shadow-sm cursor-pointer"
                  >
                    🔒 Switch to HTTPS (https://{window.location.hostname})
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* ViBe Live Pre-Flight Camera & Microphone Diagnostics Panel */}
      {(requirements.webcamRequired || requirements.microphoneRequired) && (
        <div className="mb-6 bg-slate-900 text-white rounded-2xl border border-slate-800 p-4 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Live Camera &amp; Microphone Pre-Flight Test
              </h2>
            </div>
            {faceState.ready && requirements.webcamRequired && (
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-700/60 px-2 py-0.5 rounded-full">
                ● Edge CV Active
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
            {/* Live Mirrored Webcam Preview (ViBe media-check pattern) */}
            {requirements.webcamRequired && (
              <div className="sm:col-span-7 relative aspect-video w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover -scale-x-100 ${
                    hasLiveVideo ? "block" : "hidden"
                  }`}
                />
                {!hasLiveVideo && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                    <span className="text-3xl mb-1">📷</span>
                    <span className="text-xs">
                      {running
                        ? "Starting camera preview…"
                        : "Camera preview unavailable"}
                    </span>
                  </div>
                )}

                {/* Live Edge AI Face, Pose & Object Status Pill */}
                {hasLiveVideo && (
                  <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 pointer-events-none">
                    <span
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-full backdrop-blur-md border shadow-sm ${
                        !faceState.ready
                          ? "bg-slate-900/80 text-slate-200 border-slate-600"
                          : faceState.objectDetected
                          ? "bg-rose-600/90 text-white border-rose-400 animate-pulse"
                          : faceState.cameraCovered
                          ? "bg-rose-600/90 text-white border-rose-400 animate-pulse"
                          : faceState.isBlurry
                          ? "bg-amber-600/90 text-white border-amber-400"
                          : faceState.faceCount === 0
                          ? "bg-rose-600/90 text-white border-rose-400 animate-pulse"
                          : (faceState.faceCount ?? 0) > 1
                          ? "bg-rose-600/90 text-white border-rose-400 animate-pulse"
                          : faceState.isLookingAway
                          ? "bg-amber-500/90 text-slate-950 border-amber-300"
                          : "bg-emerald-600/90 text-white border-emerald-400"
                      }`}
                    >
                      {!faceState.ready
                        ? "⏳ Loading MediaPipe Face & Object AI…"
                        : faceState.objectDetected
                        ? "🚨 Anomaly Detected — Keep Area Clear"
                        : faceState.cameraCovered
                        ? "🚫 Camera Covered / Too Dark"
                        : faceState.isBlurry
                        ? "⚠️ Camera Blurry — Clean Lens"
                        : faceState.faceCount === 0
                        ? "⚠️ No Face Detected — Center Yourself"
                        : (faceState.faceCount ?? 0) > 1
                        ? `🚨 ${faceState.faceCount} People Detected — Must Be Alone`
                        : faceState.isLookingAway
                        ? `👁️ Looking ${faceState.gazeDirection} — Face Screen`
                        : "✓ 1 Face Detected & Centered"}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Right Column: Camera & Microphone Status + Live VU Meter */}
            <div
              className={`${
                requirements.webcamRequired ? "sm:col-span-5" : "sm:col-span-12"
              } flex flex-col justify-between space-y-3`}
            >
              {requirements.webcamRequired && (
                <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                    <span className="flex items-center gap-1.5">
                      <span>📷</span> Camera Status
                    </span>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                        hasLiveVideo
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                          : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                      }`}
                    >
                      {hasLiveVideo ? "Working" : "Inactive"}
                    </span>
                  </div>
                  {cameraLabel && (
                    <p className="text-[11px] text-slate-400 mt-1 truncate">
                      {cameraLabel}
                    </p>
                  )}
                </div>
              )}

              {requirements.microphoneRequired && (
                <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                    <span className="flex items-center gap-1.5">
                      <span>🎤</span> Microphone Level
                    </span>
                    <span className="text-[11px] font-mono text-emerald-400">
                      {micLevel}%
                    </span>
                  </div>
                  {/* ViBe Live VU Progress Bar */}
                  <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-700">
                    <div
                      className={`h-full transition-none rounded-full ${
                        micLevel > 50
                          ? "bg-emerald-400"
                          : micLevel > 12
                          ? "bg-emerald-500"
                          : "bg-slate-600"
                      }`}
                      style={{ width: `${ Math.max(4, micLevel) }%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 leading-snug">
                    {micLevel > 10
                      ? "✓ Audio input detected clearly!"
                      : "Speak normally to verify your microphone bar moves."}
                  </p>
                  {micLabel && (
                    <p className="text-[10px] text-slate-500 truncate">
                      {micLabel}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Status banner */}
      {!stillChecking &&
        (allRequiredOk ? (
          <div className="mb-5 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <span className="text-lg leading-none mt-0.5">✅</span>
            <div>
              <p className="font-semibold text-xs">Ready for examination</p>
              <p className="mt-0.5 text-xs text-emerald-700">
                All browser diagnostics and required examination permissions
                have passed. You may start the exam.
              </p>
            </div>
          </div>
        ) : (
          <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <span className="text-lg leading-none mt-0.5">⚠️</span>
            <div>
              <p className="font-semibold text-xs">
                Required Permissions Needed to Proceed
              </p>
              <p className="mt-0.5 text-xs text-red-700">
                One or more mandatory checks failed or are blocked. Please fix
                them below and click &quot;Re-run Checks&quot;.
              </p>
            </div>
          </div>
        ))}

      {/* Check list */}
      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 mb-6 shadow-xs overflow-hidden">
        {checks.map((c) => {
          const isReq =
            c.key === "device" ||
            c.key === "browser" ||
            c.key === "internet" ||
            c.key === "fullscreen" ||
            (c.key === "webcam" && requirements.webcamRequired) ||
            (c.key === "microphone" && requirements.microphoneRequired) ||
            (c.key === "location" && requirements.locationRequired) ||
            (c.key === "screen" && requirements.screenRequired);
          const showFix = expandedFix === c.key || c.status === "fail";
          return (
            <div key={c.key} className="px-4 py-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-slate-800 text-xs font-semibold">
                    {c.label}
                  </p>
                  {isReq ? (
                    <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.2 rounded font-medium">
                      Required
                    </span>
                  ) : (
                    <span className="text-[10px] bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-0.2 rounded font-medium">
                      Not Required
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {c.status === "fail" && c.fixHint && (
                    <button
                      onClick={() =>
                        setExpandedFix(expandedFix === c.key ? null : c.key)
                      }
                      className="text-[11px] text-blue-600 hover:underline cursor-pointer"
                    >
                      {expandedFix === c.key ? "Hide ▲" : "How to fix ▼"}
                    </button>
                  )}
                  <StatusBadge status={c.status} />
                </div>
              </div>
              {c.detail && (
                <p
                  className={`text-[11px] mt-1 flex items-center gap-1.5 ${
                    c.status === "ok"
                      ? "text-emerald-700"
                      : c.status === "not_required"
                      ? "text-slate-400 italic"
                      : c.status === "fail"
                      ? "text-rose-600 font-medium"
                      : "text-slate-500"
                  }`}
                >
                  {c.status === "ok" && (
                    <span className="font-bold text-emerald-600">✓</span>
                  )}
                  {c.status === "not_required" && (
                    <span className="font-bold text-slate-400">○</span>
                  )}
                  {c.status === "fail" && (
                    <span className="font-bold text-rose-600">✗</span>
                  )}
                  {c.detail}
                </p>
              )}
              {showFix && c.fixHint && (
                <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800">
                  💡 <strong>How to fix:</strong> {c.fixHint}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={runChecks}
          disabled={running}
          className="border border-slate-300 px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {running ? "Checking…" : "Re-run Checks"}
        </button>

        <button
          onClick={() => {
            stopPreviewStreams();
            navigate(`/exam/${examId}/take`);
          }}
          disabled={!allRequiredOk || running}
          title={
            allRequiredOk
              ? "Start the examination"
              : "Please grant all required permissions to start"
          }
          className={`px-6 py-2 rounded-lg text-xs font-semibold shadow-sm transition-all ${
            allRequiredOk && !running
              ? "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
              : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
        >
          Start Examination →
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: CheckStatus }) {
  const map: Record<CheckStatus, { text: string; cls: string }> = {
    pending: { text: "Pending", cls: "bg-slate-100 text-slate-500" },
    checking: {
      text: "Checking…",
      cls: "bg-amber-100 text-amber-700 animate-pulse",
    },
    ok: { text: "✓ Ready", cls: "bg-green-100 text-green-700" },
    not_required: {
      text: "○ Not Required",
      cls: "bg-slate-100 text-slate-500 border border-slate-200",
    },
    fail: {
      text: "✗ Action Required",
      cls: "bg-red-100 text-red-700 font-semibold",
    },
  };
  const { text, cls } = map[status];
  return (
    <span
      className={`text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${cls}`}
    >
      {text}
    </span>
  );
}
