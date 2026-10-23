import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

export interface CommandSpec {
  command: string;
  args: string[];
}

export interface LanguageDefinition {
  language: string;
  aliases: string[];
  extensions: string[];
  defaultFileName: string;
  build?: (sourceFile: string, outFile: string, workDir: string, code?: string) => CommandSpec;
  run: (targetFile: string, workDir: string, resolvedCmd?: string, code?: string) => CommandSpec;
  probeCandidates: CommandSpec[];
  hint?: string;
}

export interface RuntimeProbeResult {
  language: string;
  available: boolean;
  version?: string;
  command?: string;
  hint?: string;
}

export interface ResolvedLanguage {
  language: string;
  available: boolean;
  version?: string;
  ext: string;
  fileName: string;
  build?: CommandSpec;
  run: CommandSpec;
  hint?: string;
}

const isWin = process.platform === 'win32';
const tsxCliPath = path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs');

export const LANGUAGE_DEFINITIONS: Record<string, LanguageDefinition> = {
  javascript: {
    language: 'javascript',
    aliases: ['js', 'node', 'javascript'],
    extensions: ['js', 'mjs', 'cjs'],
    defaultFileName: 'index.js',
    run: (targetFile) => ({
      command: process.execPath,
      args: [targetFile],
    }),
    probeCandidates: [{ command: process.execPath, args: ['--version'] }],
    hint: 'Built-in Node.js runtime',
  },
  typescript: {
    language: 'typescript',
    aliases: ['ts', 'tsx', 'typescript'],
    extensions: ['ts', 'tsx'],
    defaultFileName: 'index.ts',
    run: (targetFile) => ({
      command: process.execPath,
      args: [tsxCliPath, targetFile],
    }),
    probeCandidates: [{ command: process.execPath, args: [tsxCliPath, '--version'] }],
    hint: 'TypeScript execution via tsx',
  },
  python: {
    language: 'python',
    aliases: ['py', 'python', 'python3'],
    extensions: ['py'],
    defaultFileName: 'main.py',
    run: (targetFile, _workDir, resolvedCmd) => ({
      command: resolvedCmd || (isWin ? 'python' : 'python3'),
      args: [targetFile],
    }),
    probeCandidates: isWin
      ? [
          { command: 'python', args: ['--version'] },
          { command: 'python3', args: ['--version'] },
          { command: 'py', args: ['-3', '--version'] },
        ]
      : [
          { command: 'python3', args: ['--version'] },
          { command: 'python', args: ['--version'] },
        ],
    hint: 'Python 3 interpreter',
  },
  c: {
    language: 'c',
    aliases: ['c'],
    extensions: ['c', 'h'],
    defaultFileName: 'main.c',
    build: (sourceFile, outFile) => ({
      command: 'gcc',
      args: ['-O2', '-o', outFile, sourceFile],
    }),
    run: (targetFile) => ({
      command: targetFile,
      args: [],
    }),
    probeCandidates: [
      { command: 'gcc', args: ['--version'] },
      { command: 'clang', args: ['--version'] },
      { command: 'cc', args: ['--version'] },
    ],
    hint: 'GCC / Clang C compiler',
  },
  cpp: {
    language: 'cpp',
    aliases: ['cpp', 'c++', 'cc', 'cxx'],
    extensions: ['cpp', 'cc', 'cxx', 'hpp'],
    defaultFileName: 'main.cpp',
    build: (sourceFile, outFile) => ({
      command: 'g++',
      args: ['-std=c++17', '-O2', '-o', outFile, sourceFile],
    }),
    run: (targetFile) => ({
      command: targetFile,
      args: [],
    }),
    probeCandidates: [
      { command: 'g++', args: ['--version'] },
      { command: 'clang++', args: ['--version'] },
    ],
    hint: 'G++ / Clang++ C++17 compiler',
  },
  java: {
    language: 'java',
    aliases: ['java'],
    extensions: ['java'],
    defaultFileName: 'Main.java',
    build: (sourceFile) => ({
      command: 'javac',
      args: [sourceFile],
    }),
    run: (targetFile, workDir, _cmd, code) => {
      let className = 'Main';
      if (code) {
        const match = code.match(/public\s+class\s+([A-Za-z0-9_]+)/);
        if (match) className = match[1];
      } else {
        className = path.basename(targetFile, '.java');
      }
      return {
        command: 'java',
        args: ['-cp', workDir, className],
      };
    },
    probeCandidates: [{ command: 'javac', args: ['-version'] }],
    hint: 'OpenJDK Java SDK & Runtime',
  },
  go: {
    language: 'go',
    aliases: ['go', 'golang'],
    extensions: ['go'],
    defaultFileName: 'main.go',
    run: (targetFile) => ({
      command: 'go',
      args: ['run', targetFile],
    }),
    probeCandidates: [{ command: 'go', args: ['version'] }],
    hint: 'Go toolchain (optional)',
  },
  ruby: {
    language: 'ruby',
    aliases: ['ruby', 'rb'],
    extensions: ['rb'],
    defaultFileName: 'main.rb',
    run: (targetFile) => ({
      command: 'ruby',
      args: ['--', targetFile],
    }),
    probeCandidates: [{ command: 'ruby', args: ['--version'] }],
    hint: 'Ruby runtime (optional)',
  },
  php: {
    language: 'php',
    aliases: ['php'],
    extensions: ['php'],
    defaultFileName: 'main.php',
    run: (targetFile) => ({
      command: 'php',
      // Defense-in-depth against PHP2Shell & memory/env leakage:
      // -n: ignore php.ini to prevent arbitrary extension loading
      // -d open_basedir=.: restrict file access strictly to execution directory
      // -d max_execution_time=5: enforce runtime execution ceiling
      // -d memory_limit=128M: cap memory to prevent resource exhaustion
      // --: terminate CLI option parsing to prevent argument injection
      args: ['-n', '-d', 'open_basedir=.', '-d', 'max_execution_time=5', '-d', 'memory_limit=128M', '--', targetFile],
    }),
    probeCandidates: [{ command: 'php', args: ['--version'] }],
    hint: 'PHP CLI runtime (isolated open_basedir & capped memory)',
  },
  bash: {
    language: 'bash',
    aliases: ['bash', 'sh'],
    extensions: ['sh', 'bash'],
    defaultFileName: 'script.sh',
    run: (targetFile) => ({
      command: 'bash',
      args: ['--', targetFile],
    }),
    probeCandidates: [{ command: 'bash', args: ['--version'] }],
    hint: 'Bash shell interpreter (optional)',
  },
};

// In-memory process cache of probed runtimes
let probeCache: RuntimeProbeResult[] | null = null;
let probePromise: Promise<RuntimeProbeResult[]> | null = null;

async function testCandidate(cand: CommandSpec): Promise<{ available: boolean; version?: string }> {
  return new Promise((resolve) => {
    let resolved = false;
    let output = '';

    let child;
    try {
      child = spawn(cand.command, cand.args, {
        shell: false,
        timeout: 2000,
        env: {
          ...process.env,
          LANG: 'en_US.UTF-8',
        },
      });
    } catch {
      return resolve({ available: false });
    }

    child.stdout?.on('data', (d) => {
      output += d.toString();
    });
    child.stderr?.on('data', (d) => {
      output += d.toString();
    });

    child.on('error', () => {
      if (!resolved) {
        resolved = true;
        resolve({ available: false });
      }
    });

    child.on('close', (code) => {
      if (!resolved) {
        resolved = true;
        if (code === 0 || output.toLowerCase().includes('version') || output.toLowerCase().includes('python')) {
          const firstLine = output.trim().split('\n')[0] || '';
          resolve({ available: true, version: firstLine.slice(0, 80) });
        } else {
          resolve({ available: false });
        }
      }
    });
  });
}

/**
 * Checks toolchain presence via spawn --version with 2s timeout, cached per process.
 */
export async function probe(): Promise<RuntimeProbeResult[]> {
  if (probeCache) return probeCache;
  if (probePromise) return probePromise;

  probePromise = (async () => {
    const results: RuntimeProbeResult[] = [];

    for (const [key, def] of Object.entries(LANGUAGE_DEFINITIONS)) {
      let matched = false;
      for (const cand of def.probeCandidates) {
        const check = await testCandidate(cand);
        if (check.available) {
          results.push({
            language: key,
            available: true,
            version: check.version,
            command: cand.command,
            hint: def.hint,
          });
          matched = true;
          break;
        }
      }

      if (!matched) {
        results.push({
          language: key,
          available: false,
          hint: def.hint,
        });
      }
    }

    probeCache = results;
    return results;
  })();

  return probePromise;
}

/**
 * Sanitizes arbitrary user-supplied fileName inputs to prevent Path Traversal (CWE-22)
 * and CLI Option/Argument Injection (CWE-88).
 */
export function sanitizeExecutionFileName(raw: string, defaultName: string): string {
  if (!raw) return defaultName;
  // Strip null bytes and directory paths
  const base = path.basename(raw).replace(/\0/g, '').trim();
  // Strip dangerous path separators or traversal characters
  const clean = base.replace(/^[.\/\\]+/, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  // Disallow leading hyphen (prevents CLI argument injection) or leading dots
  if (!clean || clean.startsWith('-') || clean.startsWith('.')) {
    return defaultName;
  }
  return clean;
}

/**
 * Maps fileName or language key to resolved language definition & toolchain availability
 */
export async function resolveLanguage(fileNameOrLang: string, code?: string): Promise<ResolvedLanguage | null> {
  const probes = await probe();
  const lower = fileNameOrLang.toLowerCase().trim();
  const ext = lower.includes('.') ? lower.split('.').pop() || '' : '';

  let matchedKey: string | null = null;

  for (const [key, def] of Object.entries(LANGUAGE_DEFINITIONS)) {
    if (key === lower || def.aliases.includes(lower) || (ext && def.extensions.includes(ext))) {
      matchedKey = key;
      break;
    }
  }

  if (!matchedKey) return null;

  const def = LANGUAGE_DEFINITIONS[matchedKey];
  const probeStatus = probes.find((p) => p.language === matchedKey);
  const available = probeStatus?.available ?? false;
  const version = probeStatus?.version;
  const resolvedCmd = probeStatus?.command;

  // Sanitize filename to prevent directory traversal outside execution sandbox
  const sanitized = sanitizeExecutionFileName(lower, def.defaultFileName);
  const resolvedFileName = sanitized.includes('.') ? sanitized : def.defaultFileName;
  const targetExt = resolvedFileName.split('.').pop() || def.extensions[0];
  const baseName = path.basename(resolvedFileName, `.${targetExt}`);
  const outFileName = isWin ? `${baseName}.exe` : baseName;

  const buildCmd = def.build ? def.build(resolvedFileName, outFileName, '.', code) : undefined;
  const runCmd = def.run(def.build ? (isWin ? `.\\${outFileName}` : `./${outFileName}`) : resolvedFileName, '.', resolvedCmd, code);

  return {
    language: matchedKey,
    available,
    version,
    ext: targetExt,
    fileName: resolvedFileName,
    build: buildCmd,
    run: runCmd,
    hint: def.hint,
  };
}
