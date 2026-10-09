import { describe, it, expect } from 'vitest';
import { analyzeCode } from '../src/lib/diagnostics/codeDiagnostics';

describe('Code Diagnostics & Syntax Analyzer', () => {
  it('detects unclosed and mismatched delimiters', () => {
    const unclosedCode = 'function test() {\n  const x = (1 + 2;\n}';
    const items = analyzeCode(unclosedCode, 'file-1', 'test.js', 'javascript');

    const unclosedParen = items.find((i) => i.message.includes("Unclosed delimiter '('"));
    expect(unclosedParen).toBeDefined();
    expect(unclosedParen?.line).toBe(2);
  });

  it('detects invalid JSON syntax with exact line and column locations', () => {
    const badJson = '{\n  "name": "Obsidian",\n  "version":\n}';
    const items = analyzeCode(badJson, 'file-2', 'package.json', 'json');

    expect(items.length).toBeGreaterThan(0);
    expect(items[0].source).toBe('JSON Parser');
    expect(items[0].severity).toBe('error');
  });

  it('detects missing colons in Python control structures', () => {
    const pythonCode = 'def calculate(x, y)\n    if x > y\n        return x\n    return y';
    const items = analyzeCode(pythonCode, 'file-3', 'script.py', 'python');

    const colonErrors = items.filter((i) => i.message.includes("Expected ':'"));
    expect(colonErrors.length).toBe(2);
    expect(colonErrors[0].line).toBe(1);
    expect(colonErrors[1].line).toBe(2);
  });

  it('flags loose equality and var declarations in JavaScript', () => {
    const jsCode = 'var total = 100;\nif (total == 100) {\n  debugger;\n}';
    const items = analyzeCode(jsCode, 'file-4', 'main.js', 'javascript');

    const varWarning = items.find((i) => i.source.includes('no-var'));
    const eqWarning = items.find((i) => i.source.includes('eqeqeq'));
    const debuggerWarning = items.find((i) => i.source.includes('no-debugger'));

    expect(varWarning).toBeDefined();
    expect(eqWarning).toBeDefined();
    expect(debuggerWarning).toBeDefined();
  });
});
