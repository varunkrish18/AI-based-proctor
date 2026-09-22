import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

type CheckStatus = "pending" | "checking" | "ok" | "fail";

interface CheckItem {
  key: string;
  label: string;
  status: CheckStatus;
  detail?: string;
  fixHint?: string;
}

const initialChecks: CheckItem[] = [
  {
    key: "browser",
    label: "Browser compatibility",
    status: "pending",
    fixHint: "Use a recent version of Google Chrome, Microsoft Edge, or Mozilla Firefox.",
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
    fixHint: "Your browser does not support fullscreen. Try a different browser.",
  },
  {
    key: "webcam",
    label: "Webcam access",
    status: "pending",
    fixHint: "Click the \uD83D\uDD12 lock icon in the address bar \u2192 set Camera to Allow \u2192 click Re-run Checks.",
  },
  {
    key: "microphone",
    label: "Microphone access",
    status: "pending",
    fixHint: "Click the \uD83D\uDD12 lock icon in the address bar \u2192 set Microphone to Allow \u2192 click Re-run Checks.",
  },
  {
    key: "screen",
    label: "Screen sharing support",
    status: "pending",
    fixHint: "Screen share is requested once the exam starts.",
  },
  {
    key: "location",
    label: "Location access",
    status: "pending",
    fixHint: "Optional \u2014 allow location when your browser prompts you.",
  },
];

const REQUIRED_KEYS = ["browser", "internet", "fullscreen", "webcam", "microphone"];

export default function SystemCheck() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [checks, setChecks] = useState<CheckItem[]>(initialChecks);
  const [running, setRunning] = useState(false);
  const [expandedFix, setExpandedFix] = useState<string | null>(null);

  function update(key: string, status: CheckStatus, detail?: string) {
    setChecks((prev) => prev.map((c) => (c.key === key ? { ...c, status, detail } : c)));
  }

  async function runChecks() {
    setRunning(true);
    setExpandedFix(null);
    setChecks((prev) => prev.map((c) => ({ ...c, status: "checking" as CheckStatus, detail: undefined })));

    const hasRequiredApis =
      !!navigator.mediaDevices?.getUserMedia &&
      !!navigator.mediaDevices?.getDisplayMedia &&
      !!document.documentElement.requestFullscreen &&
      "geolocation" in navigator;
    update("browser", hasRequiredApis ? "ok" : "fail", hasRequiredApis ? undefined : "Required browser APIs are missing.");

    update("internet", navigator.onLine ? "ok" : "fail", navigator.onLine ? undefined : "No network connection detected.");

    update("fullscreen", document.fullscreenEnabled ? "ok" : "fail");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      update("webcam", "ok");
    } catch (err: unknown) {
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Permission denied \u2014 click the lock icon in the address bar to allow camera."
          : "No camera found on this device.";
      update("webcam", "fail", msg);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      update("microphone", "ok");
    } catch (err: unknown) {
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Permission denied \u2014 click the lock icon in the address bar to allow microphone."
          : "No microphone found on this device.";
      update("microphone", "fail", msg);
    }

    update("screen", !!navigator.mediaDevices?.getDisplayMedia ? "ok" : "fail", "Screen share is requested once the exam starts.");

    try {
      await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 })
      );
      update("location", "ok");
    } catch {
      update("location", "fail", "Optional \u2014 location access was not granted.");
    }

    setRunning(false);
  }

  useEffect(() => {
    runChecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requiredChecks = checks.filter((c) => REQUIRED_KEYS.includes(c.key));
  const allRequiredOk = requiredChecks.every((c) => c.status === "ok");
  const anyRequiredFail = requiredChecks.some((c) => c.status === "fail");
  const stillChecking = checks.some((c) => c.status === "checking" || c.status === "pending");

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-xl font-bold text-slate-900 mb-1">System Check</h1>
      <p className="text-slate-500 text-sm mb-6">
        We collect webcam, microphone, screen, and location data only for the duration
        and purpose of this examination. This check confirms your device meets the
        requirements <strong>before</strong> your timer starts.
      </p>

      {/* Status banner — shown after checks complete */}
      {!stillChecking && (
        <div
          className={`mb-5 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
            allRequiredOk
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          <span className="text-lg leading-none mt-0.5">{allRequiredOk ? "\u2705" : "\u274C"}</span>
          <div>
            {allRequiredOk ? (
              <p className="font-semibold">All required checks passed \u2014 you can start the exam.</p>
            ) : (
              <>
                <p className="font-semibold">Some required checks failed.</p>
                <p className="mt-0.5 text-red-700">
                  Fix the issues below, then click <strong>Re-run Checks</strong>.
                  Click the <strong>\uD83D\uDD12 lock icon</strong> in your browser\u2019s address bar to manage camera &amp; microphone permissions.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Check list */}
      <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100 mb-5">
        {checks.map((c) => {
          const isRequired = REQUIRED_KEYS.includes(c.key);
          const showFix = expandedFix === c.key;
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
                      onClick={() => setExpandedFix(showFix ? null : c.key)}
                      className="text-[11px] text-blue-600 hover:underline"
                    >
                      {showFix ? "Hide \u25B2" : "How to fix \u25BC"}
                    </button>
                  )}
                  <StatusBadge status={c.status} />
                </div>
              </div>
              {c.detail && c.status === "fail" && (
                <p className="text-xs text-red-500 mt-1">{c.detail}</p>
              )}
              {c.detail && (c.status === "ok" || c.key === "location") && c.status !== "fail" && (
                <p className="text-xs text-slate-400 mt-0.5">{c.detail}</p>
              )}
              {showFix && c.fixHint && (
                <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                  \uD83D\uDCA1 <strong>How to fix:</strong> {c.fixHint}
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
          className="border border-slate-300 px-4 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          {running ? "Checking\u2026" : "Re-run Checks"}
        </button>
        <button
          onClick={() => navigate(`/exam/${examId}/take`)}
          disabled={!allRequiredOk || running}
          title={
            !allRequiredOk ? "Fix all required checks before starting" : "Start the examination"
          }
          className={`px-5 py-2 rounded-md text-sm font-semibold transition-all ${
            allRequiredOk && !running
              ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
              : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
        >
          Start Examination
        </button>
        {anyRequiredFail && !stillChecking && (
          <span className="text-xs text-red-500 font-medium">
            \u26A0\uFE0F Fix required checks to continue
          </span>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: CheckStatus }) {
  const map: Record<CheckStatus, { text: string; cls: string }> = {
    pending: { text: "Pending", cls: "bg-slate-100 text-slate-500" },
    checking: { text: "Checking\u2026", cls: "bg-amber-100 text-amber-700 animate-pulse" },
    ok: { text: "\u2713 Available", cls: "bg-green-100 text-green-700" },
    fail: { text: "\u2717 Unavailable", cls: "bg-red-100 text-red-700" },
  };
  const { text, cls } = map[status];
  return <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${cls}`}>{text}</span>;
}
