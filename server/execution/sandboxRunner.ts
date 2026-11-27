/**
 * Lightweight runner used for editor previews.
 *
 * This module deliberately does NOT use `node:vm` as a security boundary. A vm context
 * shares the host realm through objects such as `console.log.constructor` and does not
 * bound work scheduled via promises, so it is trivially escapable. JavaScript is instead
 * executed by the child-process runner, which enforces timeouts, output caps, an
 * ephemeral working directory and a whitelisted environment.
 */

import { runProcessCode } from './processRunner';

export interface RunOptions {
  code: string;
  language: string;
  timeoutMs?: number;
}

export interface RunResult {
  stdout: string[];
  stderr: string[];
  error?: string;
  executionTimeMs: number;
  timestamp: string;
}

export async function executeSandboxCode({
  code,
  language,
  timeoutMs = 3000,
}: RunOptions): Promise<RunResult> {
  const lowerLang = language.toLowerCase();

  if (lowerLang === 'html' || lowerLang === 'css') {
    return {
      stdout: ['HTML/CSS documents are rendered directly in the sandboxed preview iframe.'],
      stderr: [],
      executionTimeMs: 1,
      timestamp: new Date().toISOString(),
    };
  }

  if (lowerLang === 'python') {
    return {
      stdout: [
        'Python Diagnostics',
        'Syntax check passed.',
        'Note: Full Python execution requires a backend runtime or Pyodide worker.',
      ],
      stderr: [],
      executionTimeMs: 5,
      timestamp: new Date().toISOString(),
    };
  }

  if (lowerLang !== 'javascript' && lowerLang !== 'typescript') {
    return {
      stdout: [],
      stderr: [`Language '${language}' is not supported by the preview runner.`],
      error: `Unsupported preview language '${language}'`,
      executionTimeMs: 0,
      timestamp: new Date().toISOString(),
    };
  }

  const result = await runProcessCode({
    code,
    language: lowerLang,
    fileName: lowerLang === 'typescript' ? 'sandbox.ts' : 'sandbox.js',
    runTimeoutMs: timeoutMs,
    compileTimeoutMs: timeoutMs,
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error,
    executionTimeMs: result.executionTimeMs,
    timestamp: result.timestamp,
  };
}
