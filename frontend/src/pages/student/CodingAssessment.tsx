import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { 
  fetchQuestions, executeCode, submitAssessmentSolution, 
  type Question, type CodeExecutionResponse 
} from "../../api/assessmentApi";
import { getAdminUserRole } from "../../api/client";
import { handleSmartEditorKeyDown } from "../../utils/editorIndentation";

export default function CodingAssessment() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [code, setCode] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
  // Timer for time consumed
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [timerActive, setTimerActive] = useState<boolean>(true);
  
  // Execution & Submission state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [execResult, setExecResult] = useState<CodeExecutionResponse | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<boolean>(false);
  const [lastSubmission, setLastSubmission] = useState<any>(null);
  
  // Filters
  const [selectedUseCase, setSelectedUseCase] = useState<string>("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");

  const editorRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const userRole = getAdminUserRole() || "STAFF";

  // Load questions on mount
  useEffect(() => {
    loadQuestions();
  }, []);

  const loadQuestions = async () => {
    try {
      setIsLoading(true);
      const data = await fetchQuestions();
      setQuestions(data);
      if (data.length > 0) {
        selectQuestion(data[0]);
      }
    } catch (err) {
      console.error("Failed to load questions:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const selectQuestion = (q: Question) => {
    setSelectedQuestion(q);
    setCode(q.starterCode);
    setExecResult(null);
    setSubmitSuccess(false);
    setElapsedSeconds(0);
    setTimerActive(true);
  };

  // Live Timer
  useEffect(() => {
    let interval: any = null;
    if (timerActive) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerActive]);

  // Window-level restricted key blocking: Windows, Ctrl, Tab, Function keys (F1-F12), Alt
  useEffect(() => {
    const blockGlobalRestrictedKeys = (e: KeyboardEvent) => {
      const isWindowsKey =
        e.key === "Meta" ||
        e.key === "OS" ||
        e.metaKey ||
        e.code === "MetaLeft" ||
        e.code === "MetaRight" ||
        e.code === "OSLeft" ||
        e.code === "OSRight" ||
        e.keyCode === 91 ||
        e.keyCode === 92;

      const isCtrlKey =
        e.key === "Control" ||
        e.ctrlKey ||
        e.code === "ControlLeft" ||
        e.code === "ControlRight" ||
        e.keyCode === 17;

      const isAltKey =
        e.key === "Alt" ||
        e.altKey ||
        e.code === "AltLeft" ||
        e.code === "AltRight" ||
        e.keyCode === 18;

      const isTabKey =
        e.key === "Tab" ||
        e.code === "Tab" ||
        e.keyCode === 9 ||
        e.which === 9;

      const isFunctionKey =
        (typeof e.key === "string" && /^F([1-9]|1[0-2])$/i.test(e.key)) ||
        (typeof e.code === "string" && /^F([1-9]|1[0-2])$/i.test(e.code));

      const targetElement = e.target as HTMLElement | null;
      const isInsideEditable = Boolean(
        targetElement &&
        (targetElement.tagName === "TEXTAREA" ||
         targetElement.tagName === "INPUT" ||
         targetElement.isContentEditable)
      );

      if (isTabKey && isInsideEditable) {
        return;
      }

      if (isWindowsKey || isCtrlKey || isAltKey || isTabKey || isFunctionKey) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }
    };

    window.addEventListener("keydown", blockGlobalRestrictedKeys, { capture: true, passive: false });
    document.addEventListener("keydown", blockGlobalRestrictedKeys, { capture: true, passive: false });

    return () => {
      window.removeEventListener("keydown", blockGlobalRestrictedKeys, { capture: true });
      document.removeEventListener("keydown", blockGlobalRestrictedKeys, { capture: true });
    };
  }, []);

  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isWindowsKey =
      e.key === "Meta" ||
      e.key === "OS" ||
      e.metaKey ||
      e.code === "MetaLeft" ||
      e.code === "MetaRight" ||
      e.code === "OSLeft" ||
      e.code === "OSRight" ||
      e.keyCode === 91 ||
      e.keyCode === 92;

    const isCtrlKey =
      e.key === "Control" ||
      e.ctrlKey ||
      e.code === "ControlLeft" ||
      e.code === "ControlRight" ||
      e.keyCode === 17;

    const isAltKey =
      e.key === "Alt" ||
      e.altKey ||
      e.code === "AltLeft" ||
      e.code === "AltRight" ||
      e.keyCode === 18;

    const isFunctionKey =
      (typeof e.key === "string" && /^F([1-9]|1[0-2])$/i.test(e.key)) ||
      (typeof e.code === "string" && /^F([1-9]|1[0-2])$/i.test(e.code));

    if (isWindowsKey || isCtrlKey || isAltKey || isFunctionKey) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const handled = handleSmartEditorKeyDown(e, {
      code,
      setCode,
      textarea: editorRef.current,
      indentSize: 4,
    });

    if (handled) {
      return;
    }
  };

  const handleRunCode = async () => {
    if (!selectedQuestion) return;
    try {
      setIsRunning(true);
      const res = await executeCode(selectedQuestion.id, code);
      setExecResult(res);
    } catch (err) {
      console.error("Code execution failed:", err);
    } finally {
      setIsRunning(false);
    }
  };

  const handleSubmitSolution = async () => {
    if (!selectedQuestion) return;
    try {
      setIsSubmitting(true);
      setTimerActive(false);
      const res = await submitAssessmentSolution({
        questionId: selectedQuestion.id,
        candidateName: "Staff (" + userRole + ")",
        code,
        timeConsumedSec: elapsedSeconds,
      });
      setLastSubmission(res);
      setSubmitSuccess(true);
    } catch (err) {
      alert("Submission error. Please check your code execution.");
      setTimerActive(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered question pool
  const filteredQuestions = questions.filter((q) => {
    const matchUseCase = selectedUseCase === "all" || q.useCase === selectedUseCase;
    const matchDiff = selectedDifficulty === "all" || q.difficulty === selectedDifficulty;
    const matchSearch = searchTerm === "" || 
      q.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
      q.id.toLowerCase().includes(searchTerm.toLowerCase());
    return matchUseCase && matchDiff && matchSearch;
  });

  const uniqueUseCases = Array.from(new Set(questions.map((q) => q.useCase)));

  return (
    <div className="min-h-screen bg-white text-slate-800 flex flex-col font-sans">
      {/* Top Header Bar (White Theme) */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white shadow-sm shadow-indigo-500/20 text-sm">
            &lt;/&gt;
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                Staff Algorithmic Coding Lab
              </h1>
              <span className="text-[10px] bg-purple-50 text-purple-700 font-bold px-2 py-0.5 rounded-full border border-purple-200 uppercase tracking-wider">
                {userRole} Access
              </span>
            </div>
            <p className="text-xs text-slate-500">
              60+ Verified Questions • Random Forest Categorization • Automated Test Runner
            </p>
          </div>
        </div>

        {/* Real-time Timer & Action Buttons */}
        <div className="flex items-center gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-1.5 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-semibold text-slate-600">Time Consumed:</span>
            <span className="font-mono text-xs font-bold text-emerald-700">
              {formatTime(elapsedSeconds)}
            </span>
          </div>

          <button
            onClick={handleRunCode}
            disabled={isRunning || isSubmitting}
            className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold tracking-wide transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
          >
            {isRunning ? (
              <span className="inline-block w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <span>▶</span>
            )}
            Run Code
          </button>

          <button
            onClick={handleSubmitSolution}
            disabled={isSubmitting || isRunning}
            className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs tracking-wide shadow-sm shadow-emerald-500/20 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? (
              <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <span>✓</span>
            )}
            Submit Solution
          </button>

          <Link
            to="/admin/coding-reports"
            className="px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition flex items-center gap-1.5"
            title="Inspect all assessment evaluation reports"
          >
            <span>📊</span> Reports
          </Link>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: 60+ Question Browser (White Theme) */}
        <div className="w-80 bg-slate-50/70 border-r border-slate-200 flex flex-col p-4 overflow-y-auto">
          <div className="mb-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Question Bank ({filteredQuestions.length}/{questions.length})
              </span>
              <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold border border-indigo-200">
                60+ Unique
              </span>
            </div>

            <input
              type="text"
              placeholder="Search questions or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
            />

            {/* Filter by Random Forest Use Case */}
            <select
              value={selectedUseCase}
              onChange={(e) => setSelectedUseCase(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-xs"
            >
              <option value="all">All Random Forest Use Cases</option>
              {uniqueUseCases.map((uc) => (
                <option key={uc} value={uc}>
                  {uc}
                </option>
              ))}
            </select>

            {/* Filter by Difficulty */}
            <div className="flex gap-1.5">
              {["all", "Easy", "Medium", "Hard"].map((d) => (
                <button
                  key={d}
                  onClick={() => setSelectedDifficulty(d)}
                  className={`flex-1 text-[11px] py-1 rounded-lg border transition font-bold capitalize cursor-pointer ${
                    selectedDifficulty === d
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Question List */}
          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
            {isLoading ? (
              <div className="text-center py-10 text-xs text-slate-500">
                <span className="inline-block w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mb-2"></span>
                <p>Loading questions...</p>
              </div>
            ) : filteredQuestions.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                No matching questions found.
              </div>
            ) : (
              filteredQuestions.map((q) => {
                const isSelected = selectedQuestion?.id === q.id;
                return (
                  <button
                    key={q.id}
                    onClick={() => selectQuestion(q)}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-indigo-50/90 border-indigo-400 text-indigo-950 shadow-xs"
                        : "bg-white border-slate-200 hover:bg-slate-100 text-slate-800 shadow-xs"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[11px] font-bold text-indigo-600">
                        {q.id}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${
                          q.difficulty === "Easy"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : q.difficulty === "Medium"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                        }`}
                      >
                        {q.difficulty}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-900 line-clamp-1 mb-1">
                      {q.title}
                    </div>
                    {/* Random Forest Tag Badge */}
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                      <span className="truncate">{q.useCase}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Center / Right: Question Details + Code Editor + Test Runner */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Question Description Panel (White Theme) */}
          <div className="w-full md:w-5/12 border-r border-slate-200 flex flex-col bg-slate-50/40 p-6 overflow-y-auto">
            {selectedQuestion ? (
              <div className="space-y-5">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
                      {selectedQuestion.id}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-md font-bold border ${
                        selectedQuestion.difficulty === "Easy"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : selectedQuestion.difficulty === "Medium"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-rose-50 text-rose-700 border-rose-200"
                      }`}
                    >
                      {selectedQuestion.difficulty}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {selectedQuestion.title}
                  </h2>
                </div>

                {/* Random Forest Categorization Card */}
                <div className="bg-white border border-indigo-200 rounded-xl p-4 space-y-1.5 shadow-xs">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-indigo-900 flex items-center gap-1.5">
                      <span>🌲</span> Random Forest Assigned Category:
                    </span>
                    <span className="text-[11px] font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-bold border border-indigo-200">
                      {(selectedQuestion.rfConfidence * 100).toFixed(1)}% Match
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-800">
                    {selectedQuestion.useCase}
                  </p>
                  {selectedQuestion.rfFeatures && Object.keys(selectedQuestion.rfFeatures).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <span className="text-[10px] text-slate-500 font-medium">Key Features:</span>
                      {Object.keys(selectedQuestion.rfFeatures).map((feat) => (
                        <span key={feat} className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono border border-slate-200">
                          {feat}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Problem Description */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Problem Description
                  </h3>
                  <div className="text-sm text-slate-700 leading-relaxed bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                    {selectedQuestion.description}
                  </div>
                </div>

                {/* Problem Hint */}
                <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-800 uppercase tracking-wider mb-1">
                    <span>💡</span> Problem Hint
                  </div>
                  <p className="text-xs text-amber-900 leading-relaxed">
                    {selectedQuestion.hint}
                  </p>
                </div>

                {/* Test Cases Overview */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Verified Test Cases ({selectedQuestion.testCases.length} Cases)
                  </h3>
                  <div className="space-y-2">
                    {selectedQuestion.testCases.map((tc, i) => (
                      <div
                        key={i}
                        className="bg-white border border-slate-200 rounded-xl p-3 text-xs font-mono space-y-1 shadow-xs"
                      >
                        <div className="flex items-center justify-between text-slate-500 text-[11px]">
                          <span className="font-semibold text-slate-700">Test Case #{i + 1}</span>
                          {tc.isHidden ? (
                            <span className="text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded text-[10px] font-bold border border-amber-200">
                              🔒 Hidden Evaluation Case
                            </span>
                          ) : (
                            <span className="text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px] font-bold border border-emerald-200">
                              Public Case
                            </span>
                          )}
                        </div>
                        {!tc.isHidden ? (
                          <div className="text-slate-700 mt-1">
                            <span className="text-slate-500">Expected Output: </span>
                            <span className="text-emerald-700 font-bold">{JSON.stringify(tc.expected)}</span>
                          </div>
                        ) : (
                          <div className="text-slate-400 italic text-[11px]">
                            Output verified against automated validation suite.
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-20 text-slate-400">Select a question from the sidebar</div>
            )}
          </div>

          {/* Code Editor & Test Results Console (White Theme) */}
          <div className="flex-1 flex flex-col bg-white">
            {/* Editor Top Bar */}
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                <span className="ml-2 font-mono text-slate-600 font-semibold">solution.py (Python 3)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 font-semibold hidden sm:inline">
                  ⚡ Smart Indent Active
                </span>
                <div className="text-[11px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200 font-semibold">
                  ⚡ Return output directly
                </div>
              </div>
            </div>

            {/* Code Editor Textarea with Line Numbers Gutter */}
            <div className="flex-1 relative flex overflow-hidden bg-slate-900 border-b border-slate-200">
              <div
                ref={gutterRef}
                className="w-12 py-3 bg-slate-950/80 border-r border-slate-800 text-right pr-3 select-none text-slate-500 font-mono text-xs leading-6 overflow-hidden shrink-0"
              >
                {Array.from({ length: Math.max(code.split("\n").length, 1) }, (_, i) => i + 1).map((num) => (
                  <div key={num}>{num}</div>
                ))}
              </div>
              <textarea
                ref={editorRef}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={handleKeyDown}
                onScroll={(e) => {
                  if (gutterRef.current) {
                    gutterRef.current.scrollTop = e.currentTarget.scrollTop;
                  }
                }}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                className="flex-1 w-full bg-transparent text-emerald-300 font-mono text-xs leading-6 p-3 outline-none resize-none selection:bg-blue-600/50 selection:text-white tab-size-4"
                placeholder="# Write your clean solution function here..."
              />
            </div>

            {/* Bottom Test Results Console (White Theme) */}
            <div className="h-64 border-t border-slate-200 bg-white flex flex-col shadow-inner">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold uppercase tracking-wider text-slate-700">
                    Execution &amp; Test Results
                  </span>
                  {execResult && (
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                        execResult.success
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-rose-50 text-rose-700 border-rose-200"
                      }`}
                    >
                      {execResult.score}% Passed ({execResult.passedCases}/{execResult.totalCases})
                    </span>
                  )}
                </div>
                {execResult && (
                  <span className="text-slate-500 font-mono text-[11px]">
                    Runtime: {execResult.totalRuntimeMs} ms
                  </span>
                )}
              </div>

              {/* Console Body */}
              <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-2 bg-slate-50/50">
                {!execResult ? (
                  <div className="text-slate-400 flex items-center justify-center h-full">
                    Click "Run Code" to compile and evaluate against test cases without inputs in the editor.
                  </div>
                ) : execResult.compilationError ? (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl whitespace-pre-wrap">
                    {execResult.compilationError}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {execResult.results.map((r) => (
                      <div
                        key={r.testIndex}
                        className={`p-3 rounded-xl border text-xs shadow-xs ${
                          r.passed
                            ? "bg-emerald-50 border-emerald-200 text-slate-800"
                            : "bg-rose-50 border-rose-200 text-slate-800"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold flex items-center gap-1.5">
                            <span className={r.passed ? "text-emerald-700 font-black" : "text-rose-700 font-black"}>
                              {r.passed ? "✓ PASS" : "✕ FAIL"}
                            </span>
                            <span>Test Case #{r.testIndex}</span>
                            {r.isHidden && (
                              <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold">
                                [HIDDEN]
                              </span>
                            )}
                          </span>
                          <span className="text-slate-500 text-[11px]">{r.runtimeMs} ms</span>
                        </div>

                        {r.error ? (
                          <div className="text-rose-700 mt-1 text-[11px] font-semibold">
                            Runtime Error: {r.error}
                          </div>
                        ) : !r.isHidden ? (
                          <div className="grid grid-cols-2 gap-2 text-[11px] mt-1 pt-1 border-t border-slate-200">
                            <div>
                              <span className="text-slate-500">Expected: </span>
                              <span className="text-emerald-700 font-bold">{JSON.stringify(r.expectedOutput)}</span>
                            </div>
                            <div>
                              <span className="text-slate-500">Actual: </span>
                              <span className={r.passed ? "text-emerald-700 font-bold" : "text-rose-700 font-bold"}>
                                {JSON.stringify(r.actualOutput)}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="text-slate-500 text-[11px] mt-1">
                            {r.passed ? "Passed secret test case assertion." : "Output mismatch on hidden case."}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Success Modal upon Submission (White Theme) */}
      {submitSuccess && lastSubmission && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl font-bold border border-emerald-200">
                ✓
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Solution Evaluated &amp; Submitted!</h3>
                <p className="text-xs text-slate-500">
                  Report shared to Admin Portal • ID: {lastSubmission.submissionId}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Question:</span>
                <span className="text-slate-900 font-bold">{lastSubmission.questionTitle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Use Case (Random Forest):</span>
                <span className="text-indigo-700 font-semibold">{lastSubmission.useCase}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Time Consumed:</span>
                <span className="text-amber-800 font-mono font-bold">{lastSubmission.timeConsumedFormatted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Score &amp; Evaluation:</span>
                <span className="text-emerald-700 font-bold">
                  {lastSubmission.evaluations.scorePercent}% ({lastSubmission.evaluations.passedCases}/{lastSubmission.evaluations.totalCases} Passed)
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setSubmitSuccess(false)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold tracking-wide transition cursor-pointer shadow-xs"
              >
                Continue Assessment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
