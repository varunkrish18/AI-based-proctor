import React from "react";

export interface FormFieldErrorProps {
  error?: string | null;
  className?: string;
}

export const FormFieldError: React.FC<FormFieldErrorProps> = ({
  error,
  className = "",
}) => {
  if (!error) return null;

  return (
    <p
      className={`mt-1.5 text-xs text-rose-600 flex items-center gap-1 ${className}`}
      role="alert"
    >
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{error}</span>
    </p>
  );
};
