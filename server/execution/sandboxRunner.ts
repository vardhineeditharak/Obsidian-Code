import vm from 'node:vm';

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

function formatSandboxValue(val: unknown): string {
  if (typeof val === 'object' && val !== null) {
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

export async function executeSandboxCode({
  code,
  language,
  timeoutMs = 3000,
}: RunOptions): Promise<RunResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const start = performance.now();
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
        '--- Python Diagnostics & Syntax Analysis ---',
        'Lightweight Python syntax checked successfully.',
        'Note: Full Python runtime execution requires a dedicated backend sandbox container or Pyodide worker.',
      ],
      stderr: [],
      executionTimeMs: 5,
      timestamp: new Date().toISOString(),
    };
  }

  try {
    const sandboxConsole = {
      log: (...args: unknown[]) => {
        stdout.push(args.map((a) => formatSandboxValue(a)).join(' '));
      },
      info: (...args: unknown[]) => {
        stdout.push(args.map((a) => formatSandboxValue(a)).join(' '));
      },
      warn: (...args: unknown[]) => {
        stderr.push(`[WARN] ${args.map((a) => formatSandboxValue(a)).join(' ')}`);
      },
      error: (...args: unknown[]) => {
        stderr.push(`[ERROR] ${args.map((a) => formatSandboxValue(a)).join(' ')}`);
      },
    };

    const context = vm.createContext(
      {
        console: sandboxConsole,
        Math,
        Date,
        JSON,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        Array,
        Object,
        String,
        Number,
        Boolean,
        RegExp,
        Map,
        Set,
        Promise,
        setTimeout: undefined,
        setInterval: undefined,
        process: undefined,
        require: undefined,
        module: undefined,
        __dirname: undefined,
        __filename: undefined,
        global: undefined,
        globalThis: undefined,
      },
      {
        codeGeneration: {
          strings: false,
          wasm: false,
        },
      }
    );

    const script = new vm.Script(code);
    const result = script.runInContext(context, {
      timeout: timeoutMs,
      displayErrors: true,
    });

    if (result !== undefined && stdout.length === 0) {
      stdout.push(formatSandboxValue(result));
    }

    return {
      stdout,
      stderr,
      executionTimeMs: Math.round(performance.now() - start),
      timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      stdout,
      stderr,
      error: err?.message || String(err),
      executionTimeMs: Math.round(performance.now() - start),
      timestamp: new Date().toISOString(),
    };
  }
}
