import { useState, useEffect } from "react";
import { checkIsMobileDevice, type DeviceCheckResult } from "../utils/deviceDetector";

interface MobileDeviceBlockerProps {
  children: React.ReactNode;
}

export default function MobileDeviceBlocker({ children }: MobileDeviceBlockerProps) {
  const [deviceCheck, setDeviceCheck] = useState<DeviceCheckResult>(() => checkIsMobileDevice());

  useEffect(() => {
    function recheck() {
      setDeviceCheck(checkIsMobileDevice());
    }

    window.addEventListener("resize", recheck);
    window.addEventListener("orientationchange", recheck);
    return () => {
      window.removeEventListener("resize", recheck);
      window.removeEventListener("orientationchange", recheck);
    };
  }, []);

  if (deviceCheck.isMobile) {
    return (
      <div className="fixed inset-0 z-[99999] bg-slate-950 text-slate-100 flex items-center justify-center p-4 overflow-y-auto font-sans">
        <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-2xl p-6 sm:p-8 shadow-2xl text-center backdrop-blur-md">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-4 text-3xl">
            📱🚫
          </div>

          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/40 mb-3">
            Mobile Devices Prohibited
          </span>

          <h1 className="text-xl sm:text-2xl font-bold text-white mb-2">
            Desktop / Laptop Required
          </h1>

          <p className="text-sm text-slate-300 mb-6 leading-relaxed">
            Exams cannot be taken on smartphones or tablets,{" "}
            <span className="text-amber-300 font-semibold">
              even with &quot;Desktop Site&quot; enabled
            </span>
            . Our AI proctoring, multi-camera tracking, and coding assessment require a physical keyboard, mouse, and desktop operating system.
          </p>

          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-left mb-6 space-y-2.5">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Examination Environment Requirements:
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-200">
              <span className="text-emerald-400">✓</span> Laptop or Desktop PC (Windows, macOS, Linux)
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-200">
              <span className="text-emerald-400">✓</span> Physical Hardware Keyboard & Mouse / Trackpad
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-200">
              <span className="text-emerald-400">✓</span> Working Web Camera & Microphone
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-200">
              <span className="text-emerald-400">✓</span> Google Chrome, Microsoft Edge, or Safari on PC
            </div>
          </div>

          <div className="bg-red-950/40 border border-red-900/60 rounded-lg p-3 text-xs text-red-300/90 text-left mb-6 font-mono break-all">
            <div className="font-semibold text-red-200 mb-1">Detection Reason:</div>
            {deviceCheck.reason || "Mobile platform or touch display detected."}
          </div>

          <div className="text-xs text-slate-400">
            Please open this exam link on your desktop computer or laptop to start your assessment.
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
