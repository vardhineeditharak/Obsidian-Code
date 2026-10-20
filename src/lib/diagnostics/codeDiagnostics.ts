import { DiagnosticsItem } from '../types';

export function analyzeCode(
  content: string,
  fileId: string,
  fileName: string,
  language: string
): DiagnosticsItem[] {
  const items: DiagnosticsItem[] = [];
  const lines = content.split('\n');
  const lowerLang = language.toLowerCase();

  // 1. Universal Delimiter Matching (parentheses, braces, brackets)
  const stack: { char: string; line: number; col: number }[] = [];
  const pairs: Record<string, string> = { ')': '(', '}': '{', ']': '[' };
  const openers = new Set(['(', '{', '[']);
  const slashCommentLangs = new Set(['javascript', 'typescript', 'css', 'c', 'cpp', 'java', 'go', 'php', 'rust', 'csharp']);
  const hashCommentLangs = new Set(['python', 'ruby', 'bash', 'sh', 'yaml', 'toml']);

  let inString: string | null = null;
  let inComment = false;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineText = lines[lineIdx];
    const lineNum = lineIdx + 1;

    for (let charIdx = 0; charIdx < lineText.length; charIdx++) {
      const ch = lineText[charIdx];
      const prevCh = charIdx > 0 ? lineText[charIdx - 1] : '';

      // Skip escaped characters
      if (prevCh === '\\') continue;

      // Handle comments & string literals
      if (!inComment && !inString) {
        if (slashCommentLangs.has(lowerLang) && ch === '/' && lineText[charIdx + 1] === '/') {
          break; // Single line comment
        }
        if (hashCommentLangs.has(lowerLang) && ch === '#') {
          break; // Hash single line comment
        }
        if (slashCommentLangs.has(lowerLang) && ch === '/' && lineText[charIdx + 1] === '*') {
          inComment = true;
          charIdx++;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
          inString = ch;
          continue;
        }
      } else if (inComment) {
        if (ch === '*' && lineText[charIdx + 1] === '/') {
          inComment = false;
          charIdx++;
        }
        continue;
      } else if (inString) {
        if (ch === inString) {
          inString = null;
        }
        continue;
      }

      // Check delimiters
      if (openers.has(ch)) {
        stack.push({ char: ch, line: lineNum, col: charIdx + 1 });
      } else if (pairs[ch]) {
        const expected = pairs[ch];
        if (stack.length === 0) {
          items.push({
            id: `${fileId}-delim-${lineNum}-${charIdx}`,
            fileId,
            fileName,
            line: lineNum,
            column: charIdx + 1,
            endLine: lineNum,
            endColumn: charIdx + 2,
            message: `Unmatched closing delimiter '${ch}'`,
            severity: 'error',
            source: 'Syntax Check',
          });
        } else {
          // Check if expected exists in stack
          let matchIdx = -1;
          for (let sIdx = stack.length - 1; sIdx >= 0; sIdx--) {
            if (stack[sIdx].char === expected) {
              matchIdx = sIdx;
              break;
            }
          }

          if (matchIdx !== -1) {
            // All items above matchIdx were unclosed!
            while (stack.length > matchIdx + 1) {
              const unclosed = stack.pop()!;
              items.push({
                id: `${fileId}-unclosed-${unclosed.line}-${unclosed.col}`,
                fileId,
                fileName,
                line: unclosed.line,
                column: unclosed.col,
                endLine: unclosed.line,
                endColumn: unclosed.col + 1,
                message: `Unclosed delimiter '${unclosed.char}'`,
                severity: 'error',
                source: 'Syntax Check',
              });
            }
            // Pop the matching one
            stack.pop();
          } else {
            items.push({
              id: `${fileId}-unmatched-close-${lineNum}-${charIdx}`,
              fileId,
              fileName,
              line: lineNum,
              column: charIdx + 1,
              endLine: lineNum,
              endColumn: charIdx + 2,
              message: `Unmatched closing delimiter '${ch}'`,
              severity: 'error',
              source: 'Syntax Check',
            });
          }
        }
      }
    }

    // Single and double quotes do not span multiple lines unless escaped with a trailing backslash
    if ((inString === '"' || inString === "'") && !lineText.endsWith('\\')) {
      inString = null;
    }
  }

  // Any remaining unclosed delimiters
  while (stack.length > 0) {
    const unclosed = stack.pop()!;
    items.push({
      id: `${fileId}-unclosed-${unclosed.line}-${unclosed.col}`,
      fileId,
      fileName,
      line: unclosed.line,
      column: unclosed.col,
      endLine: unclosed.line,
      endColumn: unclosed.col + 1,
      message: `Unclosed delimiter '${unclosed.char}'`,
      severity: 'error',
      source: 'Syntax Check',
    });
  }

  // 2. Language-Specific Validations

  // JSON Syntax Validation
  if (lowerLang === 'json') {
    if (content.trim().length > 0) {
      try {
        JSON.parse(content);
      } catch (err: unknown) {
        const errorMsg = (err as Error).message || 'Invalid JSON syntax';
        // Try parsing line and position from standard JSON error message
        let line = 1;
        let col = 1;
        const posMatch = errorMsg.match(/position\s+(\d+)/i);
        if (posMatch) {
          const pos = parseInt(posMatch[1], 10);
          let counted = 0;
          for (let i = 0; i < lines.length; i++) {
            if (counted + lines[i].length + 1 > pos) {
              line = i + 1;
              col = Math.max(1, pos - counted);
              break;
            }
            counted += lines[i].length + 1;
          }
        }
        items.push({
          id: `${fileId}-json-parse`,
          fileId,
          fileName,
          line,
          column: col,
          endLine: line,
          endColumn: col + 5,
          message: errorMsg,
          severity: 'error',
          source: 'JSON Parser',
        });
      }
    }
  }

  // JavaScript / TypeScript Style & Correctness
  if (lowerLang === 'javascript' || lowerLang === 'typescript') {
    lines.forEach((lineText, idx) => {
      const lineNum = idx + 1;

      // Check loose equality (== or != instead of === or !==)
      const looseEq = lineText.match(/(\s|^)(==|!=)(?!=)(\s|$)/);
      if (looseEq && looseEq.index !== undefined) {
        const col = looseEq.index + looseEq[1].length + 1;
        items.push({
          id: `${fileId}-loose-eq-${lineNum}`,
          fileId,
          fileName,
          line: lineNum,
          column: col,
          endLine: lineNum,
          endColumn: col + 2,
          message: `Expected '${looseEq[2]}=' instead of loose comparison '${looseEq[2]}'`,
          severity: 'warning',
          source: 'Lint Rule (eqeqeq)',
        });
      }

      // Check 'var' declarations
      const varMatch = lineText.match(/\bvar\s+([a-zA-Z_$][\w$]*)/);
      if (varMatch && varMatch.index !== undefined) {
        items.push({
          id: `${fileId}-no-var-${lineNum}`,
          fileId,
          fileName,
          line: lineNum,
          column: varMatch.index + 1,
          endLine: lineNum,
          endColumn: varMatch.index + 4,
          message: `Unexpected 'var'. Prefer 'const' or 'let' for block-scoped variables.`,
          severity: 'warning',
          source: 'Lint Rule (no-var)',
        });
      }

      // Check leftover 'debugger;'
      const debuggerMatch = lineText.match(/\bdebugger\b/);
      if (debuggerMatch && debuggerMatch.index !== undefined) {
        items.push({
          id: `${fileId}-debugger-${lineNum}`,
          fileId,
          fileName,
          line: lineNum,
          column: debuggerMatch.index + 1,
          endLine: lineNum,
          endColumn: debuggerMatch.index + 9,
          message: `Unexpected 'debugger' statement in code.`,
          severity: 'warning',
          source: 'Lint Rule (no-debugger)',
        });
      }

      // Information: console.log left in code
      const consoleMatch = lineText.match(/\bconsole\.(log|debug|info)\s*\(/);
      if (consoleMatch && consoleMatch.index !== undefined) {
        items.push({
          id: `${fileId}-console-${lineNum}`,
          fileId,
          fileName,
          line: lineNum,
          column: consoleMatch.index + 1,
          endLine: lineNum,
          endColumn: consoleMatch.index + consoleMatch[0].length,
          message: `Console statement detected ('${consoleMatch[0]}')`,
          severity: 'info',
          source: 'Code Smell',
        });
      }
    });
  }

  // Python Control Structure Checks
  if (lowerLang === 'python') {
    const pythonBlockHeaders = /^\s*(def\s+\w+|class\s+\w+|if\s+.*|elif\s+.*|else|for\s+.*|while\s+.*|try|except(\s+.*)?|finally|with\s+.*)/;
    lines.forEach((lineText, idx) => {
      const lineNum = idx + 1;
      const trimmed = lineText.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

      if (pythonBlockHeaders.test(trimmed)) {
        // Strip trailing comments
        const codePart = trimmed.split('#')[0].trim();
        if (!codePart.endsWith(':')) {
          items.push({
            id: `${fileId}-py-colon-${lineNum}`,
            fileId,
            fileName,
            line: lineNum,
            column: lineText.length,
            endLine: lineNum,
            endColumn: lineText.length + 1,
            message: `SyntaxError: Expected ':' at end of header statement`,
            severity: 'error',
            source: 'Python Syntax',
          });
        }
      }
    });
  }

  return items;
}
