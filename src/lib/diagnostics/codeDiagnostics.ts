import type { DiagnosticsItem } from '../types';

const C_STYLE_COMMENT_LANGS = new Set([
  'javascript',
  'typescript',
  'css',
  'java',
  'c',
  'cpp',
  'go',
  'php',
]);

const HASH_COMMENT_LANGS = new Set(['python', 'ruby', 'bash']);

const DELIMITER_PAIRS: Record<string, string> = {
  ')': '(',
  '}': '{',
  ']': '[',
};

const OPENERS = new Set(['(', '{', '[']);

const PYTHON_BLOCK_HEADER_REGEX =
  /^\s*(def\s+\w+|class\s+\w+|if\s+.*|elif\s+.*|else|for\s+.*|while\s+.*|try|except(\s+.*)?|finally|with\s+.*)/;

function isUnescapedAt(line: string, index: number): boolean {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && line[i] === '\\'; i--) {
    backslashes += 1;
  }
  return backslashes % 2 === 0;
}

function checkDelimiters(
  lines: string[],
  fileId: string,
  fileName: string,
  lowerLang: string
): DiagnosticsItem[] {
  const items: DiagnosticsItem[] = [];
  const stack: { char: string; line: number; col: number }[] = [];

  const supportsCComments = C_STYLE_COMMENT_LANGS.has(lowerLang);
  const supportsHashComments = HASH_COMMENT_LANGS.has(lowerLang);

  let inString: string | null = null;
  let inBlockComment = false;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineText = lines[lineIdx];
    const lineNum = lineIdx + 1;

    // Single/double quotes reset at line boundary unless backtick template literal
    if (inString && inString !== '`') {
      inString = null;
    }

    for (let charIdx = 0; charIdx < lineText.length; charIdx++) {
      const ch = lineText[charIdx];

      if (inBlockComment) {
        if (ch === '*' && lineText[charIdx + 1] === '/') {
          inBlockComment = false;
          charIdx += 1;
        }
        continue;
      }

      if (inString) {
        if (ch === inString && isUnescapedAt(lineText, charIdx)) {
          inString = null;
        }
        continue;
      }

      if (supportsCComments && ch === '/' && lineText[charIdx + 1] === '/') {
        break;
      }
      if (supportsHashComments && ch === '#') {
        break;
      }
      if (supportsCComments && ch === '/' && lineText[charIdx + 1] === '*') {
        inBlockComment = true;
        charIdx += 1;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        inString = ch;
        continue;
      }

      if (OPENERS.has(ch)) {
        stack.push({ char: ch, line: lineNum, col: charIdx + 1 });
        continue;
      }

      const expectedOpener = DELIMITER_PAIRS[ch];
      if (!expectedOpener) continue;

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
        continue;
      }

      let matchIdx = -1;
      for (let sIdx = stack.length - 1; sIdx >= 0; sIdx--) {
        if (stack[sIdx].char === expectedOpener) {
          matchIdx = sIdx;
          break;
        }
      }

      if (matchIdx !== -1) {
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

  return items;
}

function checkJsonSyntax(
  content: string,
  lines: string[],
  fileId: string,
  fileName: string
): DiagnosticsItem[] {
  if (content.trim().length === 0) return [];

  try {
    JSON.parse(content);
    return [];
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Invalid JSON syntax';
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

    return [
      {
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
      },
    ];
  }
}

function checkJavaScriptLint(
  lines: string[],
  fileId: string,
  fileName: string
): DiagnosticsItem[] {
  const items: DiagnosticsItem[] = [];

  lines.forEach((lineText, idx) => {
    const lineNum = idx + 1;
    const trimmed = lineText.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      return;
    }

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

  return items;
}

function hasBalancedParens(line: string): boolean {
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '(' || line[i] === '[' || line[i] === '{') depth += 1;
    else if (line[i] === ')' || line[i] === ']' || line[i] === '}') depth -= 1;
  }
  return depth === 0;
}

function checkPythonSyntax(
  lines: string[],
  fileId: string,
  fileName: string
): DiagnosticsItem[] {
  const items: DiagnosticsItem[] = [];

  lines.forEach((lineText, idx) => {
    const lineNum = idx + 1;
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    if (PYTHON_BLOCK_HEADER_REGEX.test(trimmed)) {
      const codePart = trimmed.split('#')[0].trim();
      if (hasBalancedParens(codePart) && !codePart.endsWith(':') && !codePart.endsWith('\\')) {
        items.push({
          id: `${fileId}-py-colon-${lineNum}`,
          fileId,
          fileName,
          line: lineNum,
          column: Math.max(1, lineText.length),
          endLine: lineNum,
          endColumn: lineText.length + 1,
          message: `SyntaxError: Expected ':' at end of header statement`,
          severity: 'error',
          source: 'Python Syntax',
        });
      }
    }
  });

  return items;
}

/**
 * Analyzes source code for delimiter mismatches, JSON syntax errors, JS/TS lints, and Python header syntax.
 */
export function analyzeCode(
  content: string,
  fileId: string,
  fileName: string,
  language: string
): DiagnosticsItem[] {
  const lines = content.split('\n');
  const lowerLang = language.toLowerCase();

  const items: DiagnosticsItem[] = checkDelimiters(lines, fileId, fileName, lowerLang);

  if (lowerLang === 'json') {
    items.push(...checkJsonSyntax(content, lines, fileId, fileName));
  } else if (lowerLang === 'javascript' || lowerLang === 'typescript') {
    items.push(...checkJavaScriptLint(lines, fileId, fileName));
  } else if (lowerLang === 'python') {
    items.push(...checkPythonSyntax(lines, fileId, fileName));
  }

  return items;
}
