import React from "react";

export interface NoSearchResultsProps {
  query?: string;
  onClear?: () => void;
  className?: string;
}

export const NoSearchResults: React.FC<NoSearchResultsProps> = ({
  query = "",
  onClear,
  className = "",
}) => {
  return (
    <div
      className={`text-center py-10 px-4 bg-white border border-slate-200 rounded-xl max-w-sm mx-auto my-6 ${className}`}
    >
      <div className="w-8 h-8 mx-auto mb-2.5 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      <h3 className="text-sm font-semibold text-slate-900">
        {query ? `No results for "${query}"` : "No results found"}
      </h3>
      <p className="text-xs text-slate-500 mt-1">
        Try checking for typos or searching with different keywords.
      </p>

      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="mt-3.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
        >
          Clear search
        </button>
      )}
    </div>
  );
};
