import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import type { RunCodeResponse } from "../types";
import { handleSmartEditorKeyDown } from "../utils/editorIndentation";

interface LanguagePreset {
  id: string;
  name: string;
  ext: string;
  template: string;
  description: string;
}

const LANGUAGES: LanguagePreset[] = [
  {
    id: "python",
    name: "Python 3",
    ext: "py",
    description: "Standard Python 3 runtime with sys and math",
    template: `import sys

def main():
    # Read all input from stdin
    lines = sys.stdin.read().splitlines()
    if not lines:
        print("Hello from Online Python IDE!")
        return

    for line in lines:
        print(f"Processed: {line}")

if __name__ == '__main__':
    main()
`,
  },
  {
    id: "java",
    name: "Java 21",
    ext: "java",
    description: "Java 21 OpenJDK runtime (Runs online without local JDK)",
    template: `import java.util.*;
import java.io.*;

public class Solution {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        System.out.println("Hello from Online Java IDE!");
        
        while (scanner.hasNextLine()) {
            String line = scanner.nextLine();
            if (line.trim().isEmpty()) continue;
            System.out.println("Processed input: " + line);
        }
        scanner.close();
    }
}
`,
  },
  {
    id: "c",
    name: "C (GCC 11+)",
    ext: "c",
    description: "Standard C11 compiled with -O2 optimization",
    template: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main() {
    printf("Hello from Online C IDE!\\n");
    
    char buffer[1024];
    while (fgets(buffer, sizeof(buffer), stdin)) {
        // Strip trailing newline
        buffer[strcspn(buffer, "\\r\\n")] = 0;
        if (strlen(buffer) > 0) {
            printf("Read input line: %s\\n", buffer);
        }
    }
    return 0;
}
`,
  },
  {
    id: "cpp",
    name: "C++ (G++ 11+)",
    ext: "cpp",
    description: "Modern C++20 with STL algorithms and containers",
    template: `#include <iostream>
#include <vector>
#include <string>

using namespace std;

int main() {
    cout << "Hello from Online C++ IDE!" << endl;
    
    string line;
    while (getline(cin, line)) {
        if (!line.empty()) {
            cout << "Input received: " << line << endl;
        }
    }
    return 0;
}
`,
  },
  {
    id: "javascript",
    name: "JavaScript (Node.js)",
    ext: "js",
    description: "V8 JavaScript runtime with fs and process",
    template: `const fs = require('fs');

function main() {
    console.log("Hello from Online JavaScript IDE!");
    
    try {
        const input = fs.readFileSync(0, 'utf-8');
        const lines = input.trim().split(/\\r?\\n/).filter(Boolean);
        lines.forEach((line) => {
            console.log("Input: " + line);
        });
    } catch (e) {
        // Stdin empty or not available
    }
}

main();
`,
  },
];

export default function OnlineIde() {
  const [selectedLang, setSelectedLang] = useState<string>("java");
  const [code, setCode] = useState<string>(LANGUAGES.find((l) => l.id === "java")?.template || "");
  const [input, setInput] = useState<string>("42\nTest sample data\n100");
  const [running, setRunning] = useState<boolean>(false);
  const [result, setResult] = useState<RunCodeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const activeLangConfig = LANGUAGES.find((l) => l.id === selectedLang) || LANGUAGES[0];

  const handleLanguageChange = (langId: string) => {
    setSelectedLang(langId);
    const newLang = LANGUAGES.find((l) => l.id === langId);
    if (newLang) {
      setCode(newLang.template);
      setResult(null);
      setError(null);
    }
  };

  const handleConfirmReset = () => {
    setCode(activeLangConfig.template);
    setShowResetConfirm(false);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const resp = await fetch("/api/exams/run-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          language: selectedLang,
          input,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(errText || `Server returned HTTP ${resp.status}`);
      }

      const data: RunCodeResponse = await resp.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Failed to execute code.");
    } finally {
      setRunning(false);
    }
  };

  const lineCount = code.split("\n").length;
  const lineNumbers = Array.from({ length: Math.max(lineCount, 1) }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Banner */}
      <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-lg shadow-md">
            💻
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-wide">Cloud Online IDE &amp; Sandbox</h1>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold px-2 py-0.5 rounded-full">
                ⚡ No Local JDK or Compiler Required
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Compile and execute Java, C, C++, Python, and Node.js code instantly in an isolated cloud sandbox.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/exams"
            className="text-xs text-slate-300 hover:text-white px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 transition"
          >
            ← Back to Exams
          </Link>
        </div>
      </div>

      {/* Main IDE Workspace */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden">
        {/* Left: Code Editor (7 cols) */}
        <div className="lg:col-span-7 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-950">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 select-none">
            <div className="flex items-center gap-2">
              <label htmlFor="language-select" className="text-xs text-slate-400 font-semibold">
                Language:
              </label>
              <select
                id="language-select"
                value={selectedLang}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="bg-slate-800 hover:bg-slate-750 text-slate-100 border border-slate-700 text-xs font-semibold rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer transition"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-slate-500 hidden sm:inline">
                {activeLangConfig.description}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyCode}
                className="text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded bg-slate-800/80 hover:bg-slate-800 transition cursor-pointer"
                title="Copy code to clipboard"
              >
                {copied ? "✓ Copied" : "📋 Copy"}
              </button>

              {/* Safe In-DOM Reset Confirmation */}
              {showResetConfirm ? (
                <div className="flex items-center gap-1.5 bg-amber-950/90 border border-amber-600/70 rounded-lg px-2.5 py-1 text-xs animate-in fade-in duration-150">
                  <span className="text-amber-300 font-semibold text-[11px]">Reset code to template?</span>
                  <button
                    type="button"
                    onClick={handleConfirmReset}
                    className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-2 py-0.5 rounded text-[11px] cursor-pointer transition shadow-sm"
                  >
                    Yes, Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(false)}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium px-2 py-0.5 rounded text-[11px] cursor-pointer transition"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(true)}
                  className="text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 px-2.5 py-1 rounded transition cursor-pointer"
                  title="Reset code to default template"
                >
                  ↺ Reset
                </button>
              )}

              <button
                type="button"
                onClick={handleRun}
                disabled={running}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-1.5 rounded-lg shadow-sm transition cursor-pointer"
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
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Smart Indentation Helper Bar */}
          <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-1 text-[11px] text-slate-400 flex items-center justify-between select-none">
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              <span>⚡</span> Smart Indent: Enter auto-indents • Tab &amp; Shift+Tab indents 4 spaces • Auto-pairs brackets
            </span>
            <span className="font-mono text-slate-400">
              {lineCount} lines • {code.length} chars
            </span>
          </div>

          {/* Code Textarea & Gutter */}
          <div className="flex-1 flex overflow-hidden relative min-h-[420px] lg:min-h-[600px] font-mono text-xs">
            {/* Gutter */}
            <div 
              ref={gutterRef}
              className="w-12 bg-slate-925 select-none text-slate-600 text-right pr-3 pt-3 leading-5 border-r border-slate-800/60 shrink-0 overflow-hidden"
            >
              {lineNumbers.map((n) => (
                <div key={n}>{n}</div>
              ))}
            </div>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                handleSmartEditorKeyDown(e, {
                  code,
                  setCode,
                  textarea: textareaRef.current,
                  indentSize: 4,
                });
              }}
              onScroll={(e) => {
                if (gutterRef.current) {
                  gutterRef.current.scrollTop = e.currentTarget.scrollTop;
                }
              }}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              className="flex-1 w-full bg-slate-950 text-slate-100 p-3 leading-5 outline-none resize-none font-mono selection:bg-blue-600 selection:text-white tab-size-4"
            />
          </div>
        </div>

        {/* Right: Input & Output Panels (5 cols) */}
        <div className="lg:col-span-5 flex flex-col bg-slate-900/60 divide-y divide-slate-800">
          {/* Top Half: Standard Input (stdin) */}
          <div className="p-4 flex flex-col h-1/2 min-h-[220px]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <span>📥</span> Standard Input (stdin)
              </span>
              <button
                type="button"
                onClick={() => setInput("")}
                className="text-[11px] text-slate-500 hover:text-slate-300 transition"
              >
                Clear
              </button>
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter stdin input data here (optional)..."
              rows={5}
              className="flex-1 w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 font-mono outline-none focus:border-blue-500 resize-none"
            />
            <span className="text-[10px] text-slate-500 mt-1">
              Passed to your program's stdin stream via Scanner / cin / sys.stdin.
            </span>
          </div>

          {/* Bottom Half: Execution Output (stdout / stderr) */}
          <div className="p-4 flex-1 flex flex-col min-h-[300px]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <span>📤</span> Output &amp; Console
              </span>

              {result && (
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                      result.status === "ACCEPTED"
                        ? "bg-emerald-950/80 text-emerald-400 border-emerald-700/60"
                        : result.status === "COMPILATION_ERROR"
                        ? "bg-purple-950/80 text-purple-400 border-purple-700/60"
                        : "bg-red-950/80 text-red-400 border-red-700/60"
                    }`}
                  >
                    {result.status}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    ⏱️ {result.executionTimeMs} ms
                  </span>
                </div>
              )}
            </div>

            <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs overflow-auto max-h-[360px]">
              {running ? (
                <div className="h-full flex items-center justify-center text-slate-400 gap-2 py-10">
                  <span className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  <span>Compiling &amp; executing code in cloud sandbox...</span>
                </div>
              ) : error ? (
                <div className="text-red-400 whitespace-pre-wrap">
                  <div className="font-bold mb-1">Execution Failure:</div>
                  {error}
                </div>
              ) : result ? (
                (() => {
                  const firstCase = result.results?.[0];
                  if (!firstCase) {
                    return <span className="text-slate-500">Program exited with no output.</span>;
                  }

                  if (firstCase.errorMessage) {
                    return (
                      <div className="text-rose-400 whitespace-pre-wrap">
                        <div className="text-xs font-bold text-rose-300 mb-1">
                          {firstCase.status === "COMPILATION_ERROR" ? "⛔ Compilation Error:" : "🚨 Runtime Error:"}
                        </div>
                        {firstCase.errorMessage}
                      </div>
                    );
                  }

                  return (
                    <div className="text-slate-200 whitespace-pre-wrap">
                      {firstCase.actualOutput ? (
                        firstCase.actualOutput
                      ) : (
                        <span className="text-slate-500 italic">Program finished (stdout empty).</span>
                      )}
                    </div>
                  );
                })()
              ) : (
                <div className="text-slate-600 italic py-10 text-center">
                  Click "▶ Run Code" above to execute your solution.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
