import React from "react";

export interface LoadingStateProps {
  title?: string;
  subtext?: string;
  showSkeleton?: boolean;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  title = "Loading...",
  subtext,
  showSkeleton = false,
  className = "",
}) => {
  return (
    <div
      className={`py-12 px-4 text-center max-w-sm mx-auto flex flex-col items-center justify-center ${className}`}
      role="status"
    >
      <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin mb-3" />
      <p className="text-sm font-medium text-slate-800">{title}</p>
      {subtext && <p className="text-xs text-slate-500 mt-1">{subtext}</p>}

      {showSkeleton && (
        <div className="w-full mt-6 space-y-2 animate-pulse">
          <div className="h-3 bg-slate-100 rounded w-3/4 mx-auto" />
          <div className="h-3 bg-slate-100 rounded w-1/2 mx-auto" />
        </div>
      )}
    </div>
  );
};
