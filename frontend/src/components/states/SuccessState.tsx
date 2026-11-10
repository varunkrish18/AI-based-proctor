import React from "react";

export interface ReceiptItem {
  label: string;
  value: React.ReactNode;
}

export interface SuccessStateProps {
  title?: string;
  message?: string;
  receiptItems?: ReceiptItem[];
  primaryAction?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  secondaryAction?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  className?: string;
}

export const SuccessState: React.FC<SuccessStateProps> = ({
  title = "Success",
  message = "Your submission has been received.",
  receiptItems,
  primaryAction,
  secondaryAction,
  className = "",
}) => {
  return (
    <div
      className={`text-center py-10 px-4 bg-white border border-slate-200 rounded-xl max-w-md mx-auto my-6 shadow-xs ${className}`}
    >
      <div className="w-9 h-9 mx-auto mb-3 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">{message}</p>

      {receiptItems && receiptItems.length > 0 && (
        <div className="bg-slate-50 rounded-lg p-3 my-4 divide-y divide-slate-100 text-left border border-slate-100">
          {receiptItems.map((item, index) => (
            <div key={index} className="flex justify-between items-center py-1.5 text-xs first:pt-0 last:pb-0">
              <span className="text-slate-500">{item.label}</span>
              <span className="text-slate-800 font-medium">{item.value}</span>
            </div>
          ))}
        </div>
      )}

      {(primaryAction || secondaryAction) && (
        <div className="mt-4 flex items-center justify-center gap-2">
          {primaryAction && (
            primaryAction.href ? (
              <a
                href={primaryAction.href}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors"
              >
                {primaryAction.label}
              </a>
            ) : (
              <button
                type="button"
                onClick={primaryAction.onClick}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                {primaryAction.label}
              </button>
            )
          )}
          {secondaryAction && (
            secondaryAction.href ? (
              <a
                href={secondaryAction.href}
                className="px-3.5 py-1.5 border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-medium rounded-lg transition-colors"
              >
                {secondaryAction.label}
              </a>
            ) : (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                className="px-3.5 py-1.5 border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                {secondaryAction.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
};
