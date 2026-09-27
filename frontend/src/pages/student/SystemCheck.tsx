import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

type CheckStatus = "pending" | "checking" | "ok" | "fail";

interface CheckItem {
  key: string;
  label: string;
  status: CheckStatus;
  detail?: string;
  fixHint?: string;
  isHardware?: boolean;
}

const initialChecks: CheckItem[] = [
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
    label: "Webcam access",
    status: "pending",
    isHardware: true,
    fixHint: "Click the site permissions / lock icon next to the URL in your browser address bar, turn on Camera, and click 'Re-run Checks'.",
  },
  {
    key: "microphone",
    label: "Microphone access",
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

const REQUIRED_KEYS = ["browser", "internet", "fullscreen", "webcam", "microphone", "location", "screen"];

export default function SystemCheck() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [checks, setChecks] = useState<CheckItem[]>(initialChecks);
  const [running, setRunning] = useState(false);
  const [expandedFix, setExpandedFix] = useState<string | null>(null);

  const isSecure =
    typeof window !== "undefined" &&
    (window.isSecureContext === true ||
      window.location.protocol === "https:" ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  function update(key: string, status: CheckStatus, detail?: string) {
    setChecks((prev) => prev.map((c) => (c.key === key ? { ...c, status, detail } : c)));
  }

  async function runChecks() {
    setRunning(true);
    setExpandedFix(null);
    setChecks((prev) => prev.map((c) => ({ ...c, status: "checking" as CheckStatus, detail: undefined })));

    // 1. Browser API compatibility - Supported across all browsers
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
      update("fullscreen", "fail", "Fullscreen mode not supported or disabled in browser");
    }

    // 4. Camera check - Real camera hardware and permission required
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("MEDIA_UNAVAILABLE");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      update("webcam", "ok", "Hardware camera connected & permission granted");
    } catch (err: any) {
      const isDenied = err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";
      update(
        "webcam",
        "fail",
        isDenied
          ? "Camera permission denied in browser settings"
          : "Camera hardware not detected or unavailable"
      );
    }

    // 5. Microphone check - Real microphone hardware and permission required
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("MEDIA_UNAVAILABLE");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      update("microphone", "ok", "Hardware microphone connected & permission granted");
    } catch (err: any) {
      const isDenied = err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";
      update(
        "microphone",
        "fail",
        isDenied
          ? "Microphone permission denied in browser settings"
          : "Microphone hardware not detected or unavailable"
      );
    }

    // 6. Location check - Real geolocation permission required
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
      const isDenied = err?.code === 1 || err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";
      update(
        "location",
        "fail",
        isDenied
          ? "Location permission denied in browser settings"
          : "Location access timed out or unavailable"
      );
    }

    // 7. Screen share check
    if (Boolean(navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices)) {
      update("screen", "ok", "Hardware screen share ready");
    } else {
      update("screen", "fail", "Screen sharing not supported by this browser");
    }

    setRunning(false);
  }

  function switchToHttps() {
    const currentUrl = window.location.href;
    if (currentUrl.startsWith("http://")) {
      window.location.href = currentUrl.replace(/^http:/, "https:");
    }
  }

  useEffect(() => {
    runChecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen to browser permission state changes (e.g. toggled in Chrome site settings popup)
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;

    const cleanupFns: Array<() => void> = [];

    const watch = async (name: PermissionName) => {
      try {
        const pStatus = await navigator.permissions.query({ name });
        const onPermChange = () => {
          runChecks();
        };
        pStatus.addEventListener("change", onPermChange);
        cleanupFns.push(() => pStatus.removeEventListener("change", onPermChange));
      } catch {
        // unsupported permission query name in some browsers
      }
    };

    watch("camera" as any);
    watch("microphone" as any);
    watch("geolocation" as any);

    return () => {
      cleanupFns.forEach((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requiredChecks = checks.filter((c) => REQUIRED_KEYS.includes(c.key));
  const allRequiredOk = requiredChecks.every((c) => c.status === "ok");
  const stillChecking = checks.some((c) => c.status === "checking" || c.status === "pending");

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-xl font-bold text-slate-900 mb-1">System Check</h1>
      <p className="text-slate-500 text-sm mb-6">
        This check confirms that all mandatory proctoring permissions (Webcam, Microphone, Location, and Screen Sharing)
        are granted <strong>before</strong> your examination timer begins.
      </p>

      {/* Helpful HTTPS Recommendation Banner if on HTTP (Non-blocking) */}
      {!isSecure && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50/80 p-4 text-blue-900 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="text-2xl mt-0.5">ℹ️</span>
            <div className="flex-1">
              <h3 className="font-bold text-sm text-blue-950">
                Tip for Full Hardware Camera &amp; Microphone Tracking
              </h3>
              <p className="mt-1 text-xs text-blue-800 leading-relaxed">
                Browser security requires HTTPS for camera, microphone, and location access:
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  onClick={switchToHttps}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 text-white font-semibold text-xs hover:bg-blue-700 transition shadow-sm cursor-pointer"
                >
                  🔒 Switch to HTTPS (https://{window.location.hostname})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status banner */}
      {!stillChecking && (
        allRequiredOk ? (
          <div className="mb-5 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <span className="text-lg leading-none mt-0.5">✅</span>
            <div>
              <p className="font-semibold">Ready for examination</p>
              <p className="mt-0.5 text-xs text-emerald-700">
                All browser diagnostics and required permissions passed. You can start your examination immediately.
              </p>
            </div>
          </div>
        ) : (
          <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <span className="text-lg leading-none mt-0.5">⚠️</span>
            <div>
              <p className="font-semibold">Permissions Required to Proceed</p>
              <p className="mt-0.5 text-xs text-red-700">
                Camera, Microphone, and Location permissions must be granted to take this exam.
                Please enable the blocked permissions in your browser address bar (lock/site settings icon) and click &quot;Re-run Checks&quot;.
              </p>
            </div>
          </div>
        )
      )}

      {/* Check list */}
      <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100 mb-5">
        {checks.map((c) => {
          const isRequired = REQUIRED_KEYS.includes(c.key);
          const showFix = expandedFix === c.key || c.status === "fail";
          return (
            <div key={c.key} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-slate-800 text-sm font-medium">{c.label}</p>
                  {isRequired && (
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">
                      Required
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {c.status === "fail" && c.fixHint && (
                    <button
                      onClick={() => setExpandedFix(expandedFix === c.key ? null : c.key)}
                      className="text-[11px] text-blue-600 hover:underline"
                    >
                      {expandedFix === c.key ? "Hide ▲" : "How to fix ▼"}
                    </button>
                  )}
                  <StatusBadge status={c.status} />
                </div>
              </div>
              {c.detail && (
                <p
                  className={`text-xs mt-1 flex items-center gap-1.5 ${
                    c.status === "ok" ? "text-emerald-700" : c.status === "fail" ? "text-rose-600 font-medium" : "text-slate-500"
                  }`}
                >
                  <span className="font-bold">{c.status === "ok" ? "✓" : "✗"}</span> {c.detail}
                </p>
              )}
              {showFix && c.fixHint && (
                <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
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
          className="border border-slate-300 px-4 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {running ? "Checking…" : "Re-run Checks"}
        </button>

        <button
          onClick={() => navigate(`/exam/${examId}/take`)}
          disabled={!allRequiredOk || running}
          title={allRequiredOk ? "Start the examination" : "Please grant all required permissions to start"}
          className={`px-6 py-2 rounded-md text-sm font-semibold shadow-sm transition-all ${
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
    checking: { text: "Checking…", cls: "bg-amber-100 text-amber-700 animate-pulse" },
    ok: { text: "✓ Ready", cls: "bg-green-100 text-green-700" },
    fail: { text: "✗ Permission Denied / Unavailable", cls: "bg-red-100 text-red-700 font-semibold" },
  };
  const { text, cls } = map[status];
  return <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${cls}`}>{text}</span>;
}
