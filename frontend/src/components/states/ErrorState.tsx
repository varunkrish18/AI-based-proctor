import React from "react";

export interface ErrorStateProps {
  title?: string;
  message?: string;
  explanation?: string;
  onRetry?: () => void;
  onBack?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = "Failed to load",
  message,
  explanation,
  onRetry,
  onBack,
  className = "",
}) => {
  return (
    <div
      className={`max-w-md mx-auto my-6 p-5 bg-white border border-rose-200 rounded-xl text-center shadow-xs ${className}`}
      role="alert"
    >
      <div className="w-8 h-8 mx-auto mb-2.5 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>

      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {message && <p className="text-xs text-rose-600 font-medium mt-1">{message}</p>}
      {explanation && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{explanation}</p>}

      {(onRetry || onBack) && (
        <div className="mt-4 flex items-center justify-center gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
            >
              Try again
            </button>
          )}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-3 py-1.5 border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-medium rounded-lg transition-colors cursor-pointer"
            >
              Back
            </button>
          )}
        </div>
      )}
    </div>
  );
};
