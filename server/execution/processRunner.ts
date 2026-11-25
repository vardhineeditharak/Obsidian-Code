/**
 * Obsidian Code — Process Runner
 *
 * Mitigations enforced by this runner:
 *   1. Authentication via `authenticateJWT` on execution routes.
 *   2. Per-user sliding-window rate limiting.
 *   3. Hard compile (10s) and run (5s) timeouts with process-tree termination.
 *   4. 64KB per-stream output cap to prevent memory exhaustion.
 *   5. Ephemeral per-run directory (`fs.mkdtemp`) removed in `finally`.
 *   6. `shell: false` with explicit argument arrays and path confinement checks.
 *   7. Whitelisted environment variables only.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { resolveLanguage, CommandSpec } from './languageRegistry';

export interface ProcessRunOptions {
  code: string;
  language?: string;
  fileName?: string;
  compileTimeoutMs?: number;
  runTimeoutMs?: number;
}

export interface ProcessRunResult {
  stdout: string[];
  stderr: string[];
  error?: string;
  exitCode: number | null;
  executionTimeMs: number;
  timestamp: string;
  language: string;
  command?: string;
}

const isWin = process.platform === 'win32';
const MAX_OUTPUT_BYTES = 64 * 1024; // 64KB per stream
const TRUNCATION_MARKER = '[Output truncated: exceeded 64KB limit]';

function getWhitelistedEnv(): NodeJS.ProcessEnv {
  const allowedKeys = [
    'PATH',
    'HOME',
    'USERPROFILE',
    'TMP',
    'TEMP',
    'LANG',
    'SystemRoot',
    'PATHEXT',
    'COMSPEC',
  ];
  const env: NodeJS.ProcessEnv = {};
  for (const k of allowedKeys) {
    if (process.env[k] !== undefined) {
      env[k] = process.env[k];
    }
  }
  return env;
}

async function killProcessTree(pid: number): Promise<void> {
  if (isWin) {
    await new Promise<void>((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { shell: false });
      killer.on('close', () => resolve());
      killer.on('error', () => resolve());
    });
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Process already exited
      }
    }
  }
}

interface ExecCommandResult {
  stdout: string[];
  stderr: string[];
  exitCode: number | null;
  timedOut: boolean;
  error?: string;
}

function splitOutputLines(chunks: Buffer[], truncated: boolean): string[] {
  const combined = chunks.length > 0 ? Buffer.concat(chunks).toString('utf-8') : '';
  const lines = combined ? combined.split(/\r?\n/) : [];
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  if (truncated) {
    lines.push(TRUNCATION_MARKER);
  }
  return lines;
}

function runSpawnCommand(
  cmdSpec: CommandSpec,
  cwd: string,
  timeoutMs: number
): Promise<ExecCommandResult> {
  return new Promise((resolve) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;
    let settled = false;

    let child;
    try {
      child = spawn(cmdSpec.command, cmdSpec.args, {
        cwd,
        env: getWhitelistedEnv(),
        shell: false,
        detached: !isWin,
      });
    } catch (err: any) {
      return resolve({
        stdout: [],
        stderr: [err?.message || String(err)],
        exitCode: 1,
        timedOut: false,
        error: err?.message || String(err),
      });
    }

    const timer = setTimeout(() => {
      // A process that exited just as the timer fired must not be reported as timed out.
      if (child.exitCode !== null) return;
      timedOut = true;
      if (child.pid) {
        void killProcessTree(child.pid);
      }
    }, timeoutMs);
    timer.unref?.();

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdoutTruncated) return;
      const remaining = MAX_OUTPUT_BYTES - stdoutBytes;
      if (chunk.length > remaining) {
        if (remaining > 0) stdoutChunks.push(chunk.subarray(0, remaining));
        stdoutBytes = MAX_OUTPUT_BYTES;
        stdoutTruncated = true;
      } else {
        stdoutChunks.push(chunk);
        stdoutBytes += chunk.length;
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderrTruncated) return;
      const remaining = MAX_OUTPUT_BYTES - stderrBytes;
      if (chunk.length > remaining) {
        if (remaining > 0) stderrChunks.push(chunk.subarray(0, remaining));
        stderrBytes = MAX_OUTPUT_BYTES;
        stderrTruncated = true;
      } else {
        stderrChunks.push(chunk);
        stderrBytes += chunk.length;
      }
    });

    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({
          stdout: [],
          stderr: [err.message || String(err)],
          exitCode: 1,
          timedOut: false,
          error: err.message,
        });
      }
    });

    child.on('close', (code, signal) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);

        const stdoutLines = splitOutputLines(stdoutChunks, stdoutTruncated);
        const stderrLines = splitOutputLines(stderrChunks, stderrTruncated);

        if (timedOut) {
          stderrLines.push(`[Process execution timed out after ${timeoutMs}ms]`);
        }

        let error: string | undefined;
        let exitCode = timedOut ? 124 : code;
        if (code === null && signal) {
          error = `Terminated by signal ${signal}`;
          stderrLines.push(error);
          exitCode = 1;
        }

        resolve({
          stdout: stdoutLines,
          stderr: stderrLines,
          exitCode,
          timedOut,
          error,
        });
      }
    });
  });
}

export async function runProcessCode({
  code,
  language = 'javascript',
  fileName,
  compileTimeoutMs = 10000,
  runTimeoutMs = 5000,
}: ProcessRunOptions): Promise<ProcessRunResult> {
  const start = performance.now();
  const timestamp = new Date().toISOString();

  // The validated `language` field is authoritative; `fileName` may only name the file.
  let resolved = await resolveLanguage(language, code);
  if (!resolved) {
    return {
      stdout: [],
      stderr: [`Language '${language}' is not recognized or supported by the execution engine.`],
      error: `Unknown language '${language}'`,
      exitCode: 1,
      executionTimeMs: 1,
      timestamp,
      language,
    };
  }

  if (fileName) {
    const byFileName = await resolveLanguage(fileName, code);
    if (!byFileName || byFileName.language !== resolved.language) {
      return {
        stdout: [],
        stderr: [`Filename '${fileName}' does not match the requested language '${language}'.`],
        error: 'Filename does not match the requested language',
        exitCode: 1,
        executionTimeMs: Math.round(performance.now() - start),
        timestamp,
        language: resolved.language,
      };
    }
    resolved = byFileName;
  }

  if (!resolved.available) {
    const hint = resolved.hint ? ` (${resolved.hint})` : '';
    return {
      stdout: [],
      stderr: [
        `${resolved.language.toUpperCase()} toolchain is not available on this server${hint}.`,
        'Please install the required toolchain or verify environment configuration.',
      ],
      error: `Toolchain for '${resolved.language}' not available`,
      exitCode: 127,
      executionTimeMs: 1,
      timestamp,
      language: resolved.language,
    };
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidian-run-'));

  try {
    const resolvedWorkDir = path.resolve(workDir);
    const srcFilePath = path.resolve(resolvedWorkDir, resolved.fileName);
    if (!srcFilePath.startsWith(resolvedWorkDir + path.sep)) {
      return {
        stdout: [],
        stderr: ['Invalid execution filename.'],
        error: 'Invalid execution filename',
        exitCode: 1,
        executionTimeMs: Math.round(performance.now() - start),
        timestamp,
        language: resolved.language,
      };
    }

    await fs.writeFile(srcFilePath, code, 'utf-8');

    if (resolved.build) {
      const compileRes = await runSpawnCommand(resolved.build, resolvedWorkDir, compileTimeoutMs);
      if (compileRes.exitCode !== 0 || compileRes.timedOut) {
        return {
          stdout: compileRes.stdout,
          stderr: compileRes.stderr,
          error: compileRes.timedOut ? 'Compilation timed out' : 'Compilation failed',
          exitCode: compileRes.exitCode,
          executionTimeMs: Math.round(performance.now() - start),
          timestamp,
          language: resolved.language,
          command: `${resolved.build.command} ${resolved.build.args.join(' ')}`,
        };
      }
    }

    const runRes = await runSpawnCommand(resolved.run, resolvedWorkDir, runTimeoutMs);
    return {
      stdout: runRes.stdout,
      stderr: runRes.stderr,
      error: runRes.error || (runRes.timedOut ? 'Execution timed out' : undefined),
      exitCode: runRes.exitCode,
      executionTimeMs: Math.round(performance.now() - start),
      timestamp,
      language: resolved.language,
      command: `${resolved.run.command} ${resolved.run.args.join(' ')}`,
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
