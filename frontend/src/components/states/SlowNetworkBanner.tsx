import React, { useState, useEffect } from "react";

export interface SlowNetworkBannerProps {
  isSlow?: boolean;
  isOffline?: boolean;
  onRetry?: () => void;
  className?: string;
}

export const SlowNetworkBanner: React.FC<SlowNetworkBannerProps> = ({
  isSlow: controlledIsSlow,
  isOffline: controlledIsOffline,
  onRetry,
  className = "",
}) => {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [isSlowNetwork, setIsSlowNetwork] = useState(false);

  useEffect(() => {
    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const nav = navigator as unknown as { connection?: { effectiveType?: string; rtt?: number } };
    if (nav.connection) {
      const checkSpeed = () => {
        const slow =
          nav.connection?.effectiveType === "2g" ||
          nav.connection?.effectiveType === "slow-2g" ||
          (nav.connection?.rtt ?? 0) > 750;
        setIsSlowNetwork(slow);
      };
      checkSpeed();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const activeOffline = controlledIsOffline ?? offline;
  const activeSlow = controlledIsSlow ?? isSlowNetwork;

  if (!activeOffline && !activeSlow) {
    return null;
  }

  return (
    <div
      className={`rounded-lg px-3.5 py-2 text-xs flex items-center justify-between gap-3 border ${
        activeOffline
          ? "bg-amber-50 border-amber-200 text-amber-900"
          : "bg-slate-100 border-slate-200 text-slate-800"
      } ${className}`}
      role="status"
    >
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full ${
            activeOffline ? "bg-amber-500 animate-pulse" : "bg-slate-400"
          }`}
        />
        <span>
          {activeOffline
            ? "You are offline. Answers are saved locally and will sync when reconnected."
            : "Slow connection. Changes are saving in the background..."}
        </span>
      </div>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="font-medium underline hover:text-slate-900 cursor-pointer"
        >
          Sync now
        </button>
      )}
    </div>
  );
};
