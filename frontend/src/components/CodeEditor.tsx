import { useState, useRef, useEffect } from "react";
import type { TestCase, RunCodeResponse, TestCaseExecutionResult } from "../types";

export interface CodeEditorProps {
  initialCode?: string;
  initialLanguage?: string;
  allowedLanguages?: string[];
  sampleTestCases?: TestCase[];
  onCodeChange?: (code: string, language: string) => void;
  onRunCode?: (code: string, language: string, customInput?: string) => Promise<RunCodeResponse>;
  readOnly?: boolean;
}

const DEFAULT_C_TEMPLATE = `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main() {
    // LeetCode-style problem solution
    // Read input from stdin
    char buffer[1024];
    while (fgets(buffer, sizeof(buffer), stdin)) {
        // Process input and output solution
        printf("%s", buffer);
    }
    return 0;
}
`;

const DEFAULT_PYTHON_TEMPLATE = `import sys

def solve():
    # Read input from stdin
    input_data = sys.stdin.read().strip()
    if not input_data:
        return
    
    # Process input and output solution
    print(input_data)

if __name__ == '__main__':
    solve()
`;

const DEFAULT_JAVA_TEMPLATE = `import java.util.*;
import java.io.*;

public class Solution {
    public static void main(String[] args) {
        // LeetCode-style problem solution
        Scanner scanner = new Scanner(System.in);
        while (scanner.hasNextLine()) {
            String line = scanner.nextLine();
            // Process input and output solution
            System.out.println(line);
        }
        scanner.close();
    }
}
`;

const DEFAULT_JS_TEMPLATE = `const fs = require('fs');

function solve() {
    // Read input from stdin
    const input = fs.readFileSync(0, 'utf-8').trim();
    if (!input) return;

    // Write your solution here
    console.log(input);
}

solve();
`;

function getTemplateForLanguage(lang: string): string {
  switch (lang.toLowerCase()) {
    case "c":
    case "gcc":
    case "clang":
      return DEFAULT_C_TEMPLATE;
    case "java":
      return DEFAULT_JAVA_TEMPLATE;
    case "javascript":
    case "js":
    case "node":
      return DEFAULT_JS_TEMPLATE;
    case "python":
    case "python3":
    case "py":
    default:
      return DEFAULT_PYTHON_TEMPLATE;
  }
}

export default function CodeEditor({
  initialCode,
  initialLanguage = "python",
  allowedLanguages = ["c", "python", "java"],
  sampleTestCases = [],
  onCodeChange,
  onRunCode,
  readOnly = false,
}: CodeEditorProps) {
  const [language, setLanguage] = useState(initialLanguage);
  const [code, setCode] = useState(
    initialCode || getTemplateForLanguage(initialLanguage)
  );

  // Bottom drawer state
  const [bottomTab, setBottomTab] = useState<"testcases" | "result">("testcases");
  const [activeCaseIdx, setActiveCaseIdx] = useState(0);
  const [useCustomInput, setUseCustomInput] = useState(false);
  const [customInput, setCustomInput] = useState("");

  // Running state
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunCodeResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialCode !== undefined && initialCode !== code) {
      setCode(initialCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  function handleLanguageChange(newLang: string) {
    setLanguage(newLang);
    const template = getTemplateForLanguage(newLang);
    const isDefault =
      !code ||
      code === DEFAULT_PYTHON_TEMPLATE ||
      code === DEFAULT_C_TEMPLATE ||
      code === DEFAULT_JAVA_TEMPLATE ||
      code === DEFAULT_JS_TEMPLATE;
    if (isDefault) {
      setCode(template);
      onCodeChange?.(template, newLang);
    } else {
      onCodeChange?.(code, newLang);
    }
  }

  function handleCodeInput(newCode: string) {
    setCode(newCode);
    onCodeChange?.(newCode, language);
  }

  // Handle Tab key inside textarea
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const spaces = "    "; // 4 spaces

      const updated = code.substring(0, start) + spaces + code.substring(end);
      setCode(updated);
      onCodeChange?.(updated, language);

      // Re-position cursor after inserted spaces
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + spaces.length;
      }, 0);
    } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleRun();
    }
  }

  function handleResetTemplate() {
    if (window.confirm("Reset code to default starter template? Current changes will be overwritten.")) {
      const template = getTemplateForLanguage(language);
      setCode(template);
      onCodeChange?.(template, language);
    }
  }

  async function handleRun() {
    if (!onRunCode || running) return;
    setRunning(true);
    setRunError(null);
    setBottomTab("result");

    try {
      const res = await onRunCode(code, language, useCustomInput ? customInput : undefined);
      setRunResult(res);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Execution failed.");
    } finally {
      setRunning(false);
    }
  }

  // Line count for gutter
  const lineCount = code.split("\n").length;
  const lineNumbers = Array.from({ length: Math.max(lineCount, 1) }, (_, i) => i + 1);

  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl text-slate-100 font-sans">
      {/* Top IDE Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>LeetIDE</span>
          </div>

          <div className="h-4 w-px bg-slate-700 mx-1" />

          {/* Language selector */}
          <select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            disabled={readOnly}
            className="bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-medium rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer transition-colors"
          >
            {allowedLanguages.includes("c") && <option value="c">C (GCC)</option>}
            {allowedLanguages.includes("python") && <option value="python">Python 3</option>}
            {allowedLanguages.includes("java") && <option value="java">Java 21</option>}
            {allowedLanguages.includes("javascript") && <option value="javascript">JavaScript (Node.js)</option>}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {!readOnly && (
            <button
              type="button"
              onClick={handleResetTemplate}
              title="Reset code to starter template"
              className="text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 px-2.5 py-1 rounded-md transition-colors cursor-pointer"
            >
              ↺ Reset
            </button>
          )}

          {onRunCode && (
            <button
              type="button"
              onClick={handleRun}
              disabled={running || readOnly}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg shadow-sm transition-all cursor-pointer"
            >
              {running ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <span>▶</span>
                  <span>Run Code</span>
                  <span className="hidden sm:inline text-[10px] text-emerald-200 font-mono opacity-80">(Ctrl+Enter)</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Code Editor Body with Line Numbers */}
      <div className="relative flex-1 flex overflow-hidden min-h-[280px]">
        {/* Line Numbers Gutter */}
        <div className="w-12 py-3 bg-slate-950/70 border-r border-slate-800/80 text-right pr-3 select-none text-slate-600 font-mono text-xs leading-6 overflow-hidden">
          {lineNumbers.map((num) => (
            <div key={num}>{num}</div>
          ))}
        </div>

        {/* Textarea Code Input */}
        <textarea
          ref={textareaRef}
          value={code}
          onChange={(e) => handleCodeInput(e.target.value)}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          className="flex-1 p-3 bg-transparent text-emerald-300 font-mono text-xs leading-6 resize-none focus:outline-none overflow-auto selection:bg-blue-600/40 tab-size-4"
          placeholder="# Write your solution here..."
        />
      </div>

      {/* Bottom Panel: Testcases & Execution Results */}
      <div className="border-t border-slate-800 bg-slate-900/90 flex flex-col max-h-[300px]">
        {/* Bottom Drawer Tabs */}
        <div className="flex items-center justify-between px-3 border-b border-slate-800 bg-slate-900">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setBottomTab("testcases")}
              className={`px-3 py-1.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                bottomTab === "testcases"
                  ? "border-emerald-500 text-emerald-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              Testcases ({sampleTestCases.length})
            </button>
            <button
              type="button"
              onClick={() => setBottomTab("result")}
              className={`px-3 py-1.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                bottomTab === "result"
                  ? "border-emerald-500 text-emerald-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>Test Result</span>
              {runResult && (
                <span
                  className={`w-2 h-2 rounded-full ${
                    runResult.status === "ACCEPTED" ? "bg-emerald-400" : "bg-rose-400"
                  }`}
                />
              )}
            </button>
          </div>

          {bottomTab === "testcases" && (
            <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useCustomInput}
                onChange={(e) => setUseCustomInput(e.target.checked)}
                className="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0 w-3 h-3"
              />
              <span>Custom Input</span>
            </label>
          )}
        </div>

        {/* Tab Content */}
        <div className="p-3 overflow-y-auto text-xs">
          {bottomTab === "testcases" && (
            <div>
              {useCustomInput ? (
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 mb-1">Standard Input (stdin):</div>
                  <textarea
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    rows={4}
                    placeholder="Enter custom input to feed to stdin..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                  />
                </div>
              ) : sampleTestCases.length > 0 ? (
                <div>
                  {/* Case Pills */}
                  <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1">
                    {sampleTestCases.map((_tc, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActiveCaseIdx(idx)}
                        className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all ${
                          activeCaseIdx === idx
                            ? "bg-slate-800 text-emerald-400 border border-emerald-500/50"
                            : "bg-slate-950/60 text-slate-400 hover:bg-slate-800 hover:text-slate-300 border border-slate-800"
                        }`}
                      >
                        Case {idx + 1}
                      </button>
                    ))}
                  </div>

                  {/* Active Case Details */}
                  {sampleTestCases[activeCaseIdx] && (
                    <div className="space-y-2 font-mono">
                      <div>
                        <div className="text-[11px] font-sans font-semibold text-slate-400 mb-1">Input:</div>
                        <pre className="bg-slate-950 border border-slate-800 rounded-md p-2 text-slate-300 overflow-x-auto whitespace-pre-wrap">
                          {sampleTestCases[activeCaseIdx].input || "(empty)"}
                        </pre>
                      </div>
                      <div>
                        <div className="text-[11px] font-sans font-semibold text-slate-400 mb-1">Expected Output:</div>
                        <pre className="bg-slate-950 border border-slate-800 rounded-md p-2 text-slate-300 overflow-x-auto whitespace-pre-wrap">
                          {sampleTestCases[activeCaseIdx].expectedOutput || "(empty)"}
                        </pre>
                      </div>
                      {sampleTestCases[activeCaseIdx].explanation && (
                        <div>
                          <div className="text-[11px] font-sans font-semibold text-slate-400 mb-1">Explanation:</div>
                          <p className="text-[11px] font-sans text-slate-300 bg-slate-950/40 border border-slate-800/60 rounded-md p-2">
                            {sampleTestCases[activeCaseIdx].explanation}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-slate-500 text-xs italic py-2">No sample test cases configured for this question.</p>
              )}
            </div>
          )}

          {bottomTab === "result" && (
            <div>
              {running ? (
                <div className="flex items-center justify-center py-8 gap-3 text-slate-400">
                  <span className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  <span>Executing code against test cases...</span>
                </div>
              ) : runError ? (
                <div className="bg-rose-950/40 border border-rose-800/80 rounded-lg p-3 text-rose-300">
                  <div className="font-bold flex items-center gap-1.5 mb-1">
                    <span>⚠️</span> Execution Failed
                  </div>
                  <pre className="text-xs whitespace-pre-wrap font-mono">{runError}</pre>
                </div>
              ) : runResult ? (
                <div className="space-y-3 font-mono">
                  {/* Status header banner */}
                  <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-bold px-2.5 py-0.5 rounded-md font-sans ${
                          runResult.status === "ACCEPTED"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                            : runResult.status === "WRONG_ANSWER"
                            ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                            : "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                        }`}
                      >
                        {runResult.status === "ACCEPTED"
                          ? "✓ Accepted"
                          : runResult.status === "WRONG_ANSWER"
                          ? "✗ Wrong Answer"
                          : runResult.status}
                      </span>
                      <span className="text-xs text-slate-400 font-sans">
                        ({runResult.passedCases}/{runResult.totalCases} test cases passed)
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 font-mono">
                      Runtime: {runResult.executionTimeMs} ms
                    </span>
                  </div>

                  {/* Results per test case */}
                  <div className="space-y-2.5">
                    {runResult.results.map((res: TestCaseExecutionResult, idx: number) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-lg border ${
                          res.passed
                            ? "bg-emerald-950/20 border-emerald-900/50"
                            : "bg-rose-950/20 border-rose-900/50"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-sans font-bold text-xs flex items-center gap-1.5">
                            <span className={res.passed ? "text-emerald-400" : "text-rose-400"}>
                              {res.passed ? "✓" : "✗"}
                            </span>
                            Case {res.testCaseIndex}
                          </span>
                          <span className="text-[11px] text-slate-400">{res.executionTimeMs} ms</span>
                        </div>

                        {res.errorMessage && (
                          <div className="mb-2 p-2 bg-rose-950/60 border border-rose-800/60 rounded text-rose-200 text-[11px] whitespace-pre-wrap">
                            {res.errorMessage}
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <div className="text-slate-400 mb-0.5">Input:</div>
                            <pre className="bg-slate-950 p-1.5 rounded border border-slate-800 text-slate-300 overflow-x-auto whitespace-pre-wrap">
                              {res.input || "(empty)"}
                            </pre>
                          </div>
                          <div>
                            <div className="text-slate-400 mb-0.5">Expected:</div>
                            <pre className="bg-slate-950 p-1.5 rounded border border-slate-800 text-emerald-300 overflow-x-auto whitespace-pre-wrap">
                              {res.expectedOutput || "(empty)"}
                            </pre>
                          </div>
                          <div className="sm:col-span-2">
                            <div className="text-slate-400 mb-0.5">Actual Output:</div>
                            <pre
                              className={`p-1.5 rounded border overflow-x-auto whitespace-pre-wrap ${
                                res.passed
                                  ? "bg-slate-950 border-slate-800 text-emerald-300"
                                  : "bg-rose-950/30 border-rose-800/60 text-rose-300"
                              }`}
                            >
                              {res.actualOutput || "(no output)"}
                            </pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-slate-500 text-xs italic py-3 text-center">
                  Click <strong className="text-slate-400 font-semibold">▶ Run Code</strong> to execute your solution against test cases.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
