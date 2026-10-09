/**
 * Obsidian Code — Process Runner
 * 
 * SECURITY ARCHITECTURE & THREAT MITIGATION NOTICE:
 * Arbitrary code execution is inherent to multi-language developer IDEs.
 * The mitigations enforced by this runner are:
 *   1. Authentication: Enforced via `authenticateJWT` middleware on all execution endpoints.
 *   2. Rate Limiting: Per-user sliding-window limits (e.g. max 10 executions/min) to prevent abuse.
 *   3. Strict Timeouts: Hard limits (compile: 10s, run: 5s) with recursive process tree termination.
 *   4. Output Caps: Max 64KB per stream to prevent memory exhaustion and runaway stdout loops.
 *   5. Per-run Temp Isolation: Each execution operates in an ephemeral, unique directory (fs.mkdtemp)
 *      which is completely removed in a `finally` block.
 *   6. Shell Injection Prevention: All processes are spawned with `shell: false` and explicit argument arrays.
 *   7. Environment Sanitization: Only a whitelisted set of environment variables (PATH, TEMP, SystemRoot) are passed.
 * 
 * PRODUCTION RECOMMENDATION:
 * For multi-tenant production hosting, containerized microVM sandboxes (e.g. gVisor, Docker, or AWS Firecracker)
 * are strongly recommended over running directly on the host OS.
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
      // In POSIX, kill process group
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
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

function runSpawnCommand(
  cmdSpec: CommandSpec,
  cwd: string,
  timeoutMs: number
): Promise<ExecCommandResult> {
  return new Promise((resolve) => {
    let stdoutBuffer = '';
    let stderrBuffer = '';
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
        detached: !isWin, // Detach on POSIX so we can kill process group
      });
    } catch (err: any) {
      return resolve({
        stdout: [],
        stderr: [err.message || String(err)],
        exitCode: 1,
        timedOut: false,
        error: err.message,
      });
    }

    const timer = setTimeout(async () => {
      timedOut = true;
      if (child.pid) {
        await killProcessTree(child.pid);
      }
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdoutTruncated) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_OUTPUT_BYTES) {
        const allowed = MAX_OUTPUT_BYTES - (stdoutBytes - chunk.length);
        if (allowed > 0) stdoutBuffer += chunk.slice(0, allowed).toString('utf-8');
        stdoutTruncated = true;
      } else {
        stdoutBuffer += chunk.toString('utf-8');
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderrTruncated) return;
      stderrBytes += chunk.length;
      if (stderrBytes > MAX_OUTPUT_BYTES) {
        const allowed = MAX_OUTPUT_BYTES - (stderrBytes - chunk.length);
        if (allowed > 0) stderrBuffer += chunk.slice(0, allowed).toString('utf-8');
        stderrTruncated = true;
      } else {
        stderrBuffer += chunk.toString('utf-8');
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

    child.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);

        const stdoutLines = stdoutBuffer ? stdoutBuffer.split(/\r?\n/) : [];
        if (stdoutLines.length > 0 && stdoutLines[stdoutLines.length - 1] === '') {
          stdoutLines.pop();
        }
        if (stdoutTruncated) {
          stdoutLines.push(TRUNCATION_MARKER);
        }

        const stderrLines = stderrBuffer ? stderrBuffer.split(/\r?\n/) : [];
        if (stderrLines.length > 0 && stderrLines[stderrLines.length - 1] === '') {
          stderrLines.pop();
        }
        if (stderrTruncated) {
          stderrLines.push(TRUNCATION_MARKER);
        }

        if (timedOut) {
          stderrLines.push(`[Process execution timed out after ${timeoutMs}ms]`);
        }

        resolve({
          stdout: stdoutLines,
          stderr: stderrLines,
          exitCode: timedOut ? 124 : code,
          timedOut,
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

  // Resolve language and toolchain
  const resolved = await resolveLanguage(fileName || language, code);
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

  if (!resolved.available) {
    const hint = resolved.hint ? ` (${resolved.hint})` : '';
    return {
      stdout: [],
      stderr: [
        `${resolved.language.toUpperCase()} toolchain is not available on this server${hint}.`,
        `Please install the required toolchain or verify environment configuration.`,
      ],
      error: `Toolchain for '${resolved.language}' not available`,
      exitCode: 127,
      executionTimeMs: 1,
      timestamp,
      language: resolved.language,
    };
  }

  // Create isolated ephemeral directory
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidian-run-'));

  try {
    const srcFilePath = path.join(workDir, resolved.fileName);
    await fs.writeFile(srcFilePath, code, 'utf-8');

    // 1. Optional compilation step
    if (resolved.build) {
      const compileRes = await runSpawnCommand(resolved.build, workDir, compileTimeoutMs);
      if (compileRes.exitCode !== 0 || compileRes.timedOut) {
        const duration = Math.round(performance.now() - start);
        return {
          stdout: compileRes.stdout,
          stderr: compileRes.stderr,
          error: compileRes.timedOut ? 'Compilation timed out' : 'Compilation failed',
          exitCode: compileRes.exitCode,
          executionTimeMs: duration,
          timestamp,
          language: resolved.language,
          command: `${resolved.build.command} ${resolved.build.args.join(' ')}`,
        };
      }
    }

    // 2. Execution step
    const runRes = await runSpawnCommand(resolved.run, workDir, runTimeoutMs);
    const duration = Math.round(performance.now() - start);

    return {
      stdout: runRes.stdout,
      stderr: runRes.stderr,
      error: runRes.error || (runRes.timedOut ? 'Execution timed out' : undefined),
      exitCode: runRes.exitCode,
      executionTimeMs: duration,
      timestamp,
      language: resolved.language,
      command: `${resolved.run.command} ${resolved.run.args.join(' ')}`,
    };
  } finally {
    // Ephemeral cleanup
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
