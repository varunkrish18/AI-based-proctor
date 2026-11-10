import React from "react";

export interface IndentationOptions {
  code: string;
  setCode: (newCode: string) => void;
  textarea: HTMLTextAreaElement | null;
  onCodeChange?: (newCode: string) => void;
  indentSize?: number;
}

const BRACKET_PAIRS: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
  '"': '"',
  "'": "'",
  "`": "`",
};

const CLOSING_CHARS = new Set([")", "]", "}", '"', "'", "`"]);

/**
 * Handles professional code editor key events:
 * - Enter: Preserves indentation, auto-indents after block openers ({, :, (, [), expands inside {}
 * - Tab: 4 spaces indent, multi-line block indent
 * - Shift + Tab: 4 spaces unindent, multi-line block unindent
 * - Backspace: Smart unindent at indentation boundaries, paired bracket deletion
 * - Brackets & Quotes: Auto-closing pairs and skip-over
 */
export function handleSmartEditorKeyDown(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  options: IndentationOptions
): boolean {
  const { code, setCode, textarea, onCodeChange, indentSize = 4 } = options;
  if (!textarea) return false;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const indentStr = " ".repeat(indentSize);

  // 1. Enter Key - Smart Auto-Indentation
  if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    e.stopPropagation();

    // Find the current line content up to the cursor
    const lastNewlineIdx = code.lastIndexOf("\n", start - 1);
    const lineStart = lastNewlineIdx === -1 ? 0 : lastNewlineIdx + 1;
    const currentLineBeforeCursor = code.substring(lineStart, start);

    // Extract current line indentation
    const indentMatch = currentLineBeforeCursor.match(/^(\s*)/);
    const baseIndent = indentMatch ? indentMatch[1] : "";

    // Check if cursor is directly between braces e.g. { | }
    const charBefore = start > 0 ? code[start - 1] : "";
    const charAfter = start < code.length ? code[start] : "";

    if ((charBefore === "{" && charAfter === "}") || 
        (charBefore === "(" && charAfter === ")") || 
        (charBefore === "[" && charAfter === "]")) {
      const innerIndent = baseIndent + indentStr;
      const insertion = "\n" + innerIndent + "\n" + baseIndent;
      const newCode = code.substring(0, start) + insertion + code.substring(end);
      const newCursorPos = start + 1 + innerIndent.length;

      setCode(newCode);
      onCodeChange?.(newCode);

      requestAnimationFrame(() => {
        if (textarea) {
          textarea.selectionStart = textarea.selectionEnd = newCursorPos;
        }
      });
      return true;
    }

    // Check if line before cursor ends with block opener
    const trimmedBefore = currentLineBeforeCursor.trimEnd();
    const opensBlock = /[{:(\[]$/.test(trimmedBefore);
    const nextIndent = opensBlock ? baseIndent + indentStr : baseIndent;

    const insertion = "\n" + nextIndent;
    const newCode = code.substring(0, start) + insertion + code.substring(end);
    const newCursorPos = start + insertion.length;

    setCode(newCode);
    onCodeChange?.(newCode);

    requestAnimationFrame(() => {
      if (textarea) {
        textarea.selectionStart = textarea.selectionEnd = newCursorPos;
      }
    });
    return true;
  }

  // 2. Tab Key - Indent / Shift+Tab Unindent
  if (e.key === "Tab") {
    e.preventDefault();
    e.stopPropagation();

    const isShift = e.shiftKey;

    // Multi-line selection
    if (start !== end && code.substring(start, end).includes("\n")) {
      const firstLineStart = code.lastIndexOf("\n", start - 1) + 1;
      const lastLineEnd = code.indexOf("\n", end);
      const effectiveEnd = lastLineEnd === -1 ? code.length : lastLineEnd;

      const selectedBlock = code.substring(firstLineStart, effectiveEnd);
      const lines = selectedBlock.split("\n");

      let modifiedLines: string[];
      if (isShift) {
        // Unindent each line by up to indentSize spaces
        modifiedLines = lines.map((line) => {
          return line.replace(new RegExp(`^ {1,${indentSize}}`), "");
        });
      } else {
        // Indent each line
        modifiedLines = lines.map((line) => indentStr + line);
      }

      const replacement = modifiedLines.join("\n");
      const newCode = code.substring(0, firstLineStart) + replacement + code.substring(effectiveEnd);

      setCode(newCode);
      onCodeChange?.(newCode);

      requestAnimationFrame(() => {
        if (textarea) {
          textarea.selectionStart = firstLineStart;
          textarea.selectionEnd = firstLineStart + replacement.length;
        }
      });
      return true;
    }

    // Single-line or no selection
    if (isShift) {
      // Unindent current line
      const lineStart = code.lastIndexOf("\n", start - 1) + 1;
      const lineEnd = code.indexOf("\n", start);
      const effectiveEnd = lineEnd === -1 ? code.length : lineEnd;
      const currentLine = code.substring(lineStart, effectiveEnd);

      const spaceMatch = currentLine.match(/^( +)/);
      if (spaceMatch) {
        const spacesToRemove = Math.min(spaceMatch[1].length, indentSize);
        const newLine = currentLine.substring(spacesToRemove);
        const newCode = code.substring(0, lineStart) + newLine + code.substring(effectiveEnd);
        const newCursorPos = Math.max(lineStart, start - spacesToRemove);

        setCode(newCode);
        onCodeChange?.(newCode);

        requestAnimationFrame(() => {
          if (textarea) {
            textarea.selectionStart = textarea.selectionEnd = newCursorPos;
          }
        });
      }
      return true;
    } else {
      // Normal Tab indent
      const newCode = code.substring(0, start) + indentStr + code.substring(end);
      const newCursorPos = start + indentSize;

      setCode(newCode);
      onCodeChange?.(newCode);

      requestAnimationFrame(() => {
        if (textarea) {
          textarea.selectionStart = textarea.selectionEnd = newCursorPos;
        }
      });
      return true;
    }
  }

  // 3. Backspace Key - Smart De-indent & Pair Deletion
  if (e.key === "Backspace" && start === end) {
    // Check if cursor is between a pair e.g. (|), ["|"], etc.
    if (start > 0 && start < code.length) {
      const prevChar = code[start - 1];
      const nextChar = code[start];
      if (BRACKET_PAIRS[prevChar] === nextChar) {
        e.preventDefault();
        e.stopPropagation();
        const newCode = code.substring(0, start - 1) + code.substring(start + 1);
        setCode(newCode);
        onCodeChange?.(newCode);
        requestAnimationFrame(() => {
          if (textarea) {
            textarea.selectionStart = textarea.selectionEnd = start - 1;
          }
        });
        return true;
      }
    }

    // Smart 4-space unindent on backspace
    const lineStart = code.lastIndexOf("\n", start - 1) + 1;
    const beforeCursor = code.substring(lineStart, start);

    if (beforeCursor.length > 0 && /^ +$/.test(beforeCursor)) {
      const spacesToDelete = beforeCursor.length % indentSize === 0 ? indentSize : beforeCursor.length % indentSize;
      e.preventDefault();
      e.stopPropagation();

      const newCode = code.substring(0, start - spacesToDelete) + code.substring(end);
      const newCursorPos = start - spacesToDelete;

      setCode(newCode);
      onCodeChange?.(newCode);

      requestAnimationFrame(() => {
        if (textarea) {
          textarea.selectionStart = textarea.selectionEnd = newCursorPos;
        }
      });
      return true;
    }
  }

  // 4. Auto-closing brackets and quotes
  if (BRACKET_PAIRS[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const openingChar = e.key;
    const closingChar = BRACKET_PAIRS[openingChar];

    // If selection exists, wrap selection
    if (start !== end) {
      e.preventDefault();
      e.stopPropagation();
      const selected = code.substring(start, end);
      const wrapped = openingChar + selected + closingChar;
      const newCode = code.substring(0, start) + wrapped + code.substring(end);

      setCode(newCode);
      onCodeChange?.(newCode);

      requestAnimationFrame(() => {
        if (textarea) {
          textarea.selectionStart = start + 1;
          textarea.selectionEnd = end + 1;
        }
      });
      return true;
    }

    // Skip over closing character if user types it right before it
    if (CLOSING_CHARS.has(openingChar) && start < code.length && code[start] === openingChar) {
      e.preventDefault();
      e.stopPropagation();
      requestAnimationFrame(() => {
        if (textarea) {
          textarea.selectionStart = textarea.selectionEnd = start + 1;
        }
      });
      return true;
    }

    // Insert pair
    e.preventDefault();
    e.stopPropagation();
    const newCode = code.substring(0, start) + openingChar + closingChar + code.substring(end);

    setCode(newCode);
    onCodeChange?.(newCode);

    requestAnimationFrame(() => {
      if (textarea) {
        textarea.selectionStart = textarea.selectionEnd = start + 1;
      }
    });
    return true;
  }

  // 5. Skip over closing bracket if typed
  if (CLOSING_CHARS.has(e.key) && start === end && start < code.length && code[start] === e.key && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    e.stopPropagation();
    requestAnimationFrame(() => {
      if (textarea) {
        textarea.selectionStart = textarea.selectionEnd = start + 1;
      }
    });
    return true;
  }

  return false;
}
