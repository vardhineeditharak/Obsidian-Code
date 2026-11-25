import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { resolveLanguage, probe, LANGUAGE_DEFINITIONS } from '../server/execution/languageRegistry';
import { runProcessCode } from '../server/execution/processRunner';
import { executeSandboxCode } from '../server/execution/sandboxRunner';
import { executeRoutes } from '../server/routes/executeRoutes';
import { config } from '../server/config';

describe('Multi-Language Execution, Sandbox Runner & Route Security', () => {
  let server: http.Server;
  let baseUrl: string;
  let userToken: string;
  let rateLimitUserToken: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/execute', executeRoutes);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = (server.address() as AddressInfo).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    userToken = jwt.sign(
      { userId: 'exec-user-main', email: 'exec@test.dev', name: 'Exec Tester' },
      config.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );
    rateLimitUserToken = jwt.sign(
      { userId: `exec-ratelimit-${Date.now()}`, email: 'rl@test.dev', name: 'RL Tester' },
      config.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe('Language Registry & Sanitization', () => {
    it('probes toolchains and resolves all supported languages, aliases, and Java main classes', async () => {
      const runtimes = await probe();
      expect(Array.isArray(runtimes)).toBe(true);
      expect(runtimes.map((r) => r.language)).toEqual(Object.keys(LANGUAGE_DEFINITIONS));

      const jsRes = await resolveLanguage('app.js');
      expect(jsRes?.language).toBe('javascript');
      expect(jsRes?.available).toBe(true);

      const tsRes = await resolveLanguage('typescript');
      expect(tsRes?.language).toBe('typescript');
      expect(tsRes?.available).toBe(true);

      const pyRes = await resolveLanguage('py');
      expect(pyRes?.language).toBe('python');

      const goRes = await resolveLanguage('golang');
      expect(goRes?.language).toBe('go');

      // Path traversal in filename is sanitized back to defaultFileName
      const unsafeJs = await resolveLanguage('../../evil.js');
      expect(unsafeJs?.fileName).toBe('evil.js');

      const unsafeDot = await resolveLanguage('..hidden.js');
      expect(unsafeDot?.fileName).toBe('index.js');

      // Java class extraction from code
      const javaRes = await resolveLanguage('java', 'public class HelloWorld { public static void main(String[] a) {} }');
      expect(javaRes?.run.args).toEqual(['-cp', '.', 'HelloWorld']);

      expect(await resolveLanguage('unknown.xyz')).toBeNull();
    });
  });

  describe('Process Runner Isolation, Timeouts, 64KB Cap & Env Whitelist', () => {
    it('executes JavaScript and TypeScript code in ephemeral dirs and cleans up temp directories', async () => {
      const beforeEntries = (await fs.readdir(os.tmpdir())).filter((e) => e.startsWith('obsidian-run-'));

      const jsResult = await runProcessCode({
        code: 'console.log("Hello JS"); console.error("Warn JS");',
        language: 'javascript',
      });
      expect(jsResult.exitCode).toBe(0);
      expect(jsResult.stdout).toEqual(['Hello JS']);
      expect(jsResult.stderr).toEqual(['Warn JS']);
      expect(jsResult.error).toBeUndefined();

      const tsResult = await runProcessCode({
        code: 'const sum = (a: number, b: number): number => a + b;\nconsole.log(`TS=${sum(20, 22)}`);',
        language: 'typescript',
      });
      expect(tsResult.exitCode).toBe(0);
      expect(tsResult.stdout).toEqual(['TS=42']);

      const afterEntries = (await fs.readdir(os.tmpdir())).filter((e) => e.startsWith('obsidian-run-'));
      expect(afterEntries.length).toBeLessThanOrEqual(beforeEntries.length);
    });

    it('enforces execution timeout with exitCode 124 and kills runaway process', async () => {
      const res = await runProcessCode({
        code: 'while (true) {}',
        language: 'javascript',
        runTimeoutMs: 700,
      });
      expect(res.exitCode).toBe(124);
      expect(res.error).toContain('timed out');
      expect(res.stderr.join('\n')).toContain('timed out');
    });

    it('caps stdout/stderr at 64KB and emits truncation marker', async () => {
      const res = await runProcessCode({
        code: 'process.stdout.write("X".repeat(70000));',
        language: 'javascript',
      });
      expect(res.exitCode).toBe(0);
      expect(res.stdout[res.stdout.length - 1]).toBe('[Output truncated: exceeded 64KB limit]');
      const totalChars = res.stdout.join('').length;
      expect(totalChars).toBeLessThan(66000);
    });

    it('whitelists environment variables so server secrets are never leaked to child processes', async () => {
      process.env.__OBSIDIAN_SECRET_LEAK_TEST = 'super-secret-value';
      try {
        const res = await runProcessCode({
          code: 'console.log(process.env.__OBSIDIAN_SECRET_LEAK_TEST || "NOT_EXPOSED");',
          language: 'javascript',
        });
        expect(res.exitCode).toBe(0);
        expect(res.stdout).toEqual(['NOT_EXPOSED']);
      } finally {
        delete process.env.__OBSIDIAN_SECRET_LEAK_TEST;
      }
    });

    it('returns exitCode 1 for unknown language', async () => {
      const res = await runProcessCode({ code: 'echo 1', language: 'brainfuck_99' });
      expect(res.exitCode).toBe(1);
      expect(res.error).toContain('Unknown language');
    });
  });

  describe('VM Sandbox Runner (server/execution/sandboxRunner.ts)', () => {
    it('handles html/css, python diagnostic fallback, isolated JS execution, and blocks globals/process', async () => {
      const htmlRes = await executeSandboxCode({ code: '<h1>Hi</h1>', language: 'html' });
      expect(htmlRes.stdout[0]).toContain('sandboxed preview iframe');

      const pyRes = await executeSandboxCode({ code: 'print(1)', language: 'python' });
      expect(pyRes.stdout[0]).toContain('Python Diagnostics');

      const jsRes = await executeSandboxCode({
        code: 'console.log("ok", { a: 1 }); console.warn("careful");',
        language: 'javascript',
      });
      expect(jsRes.stdout[0]).toContain('ok');
      expect(jsRes.stderr[0]).toBe('[WARN] careful');

      const blockedRes = await executeSandboxCode({
        code: 'typeof process === "undefined" && typeof require === "undefined" ? "isolated" : "leaked"',
        language: 'javascript',
      });
      expect(blockedRes.stdout).toEqual(['isolated']);

      const timeoutRes = await executeSandboxCode({
        code: 'while (true) {}',
        language: 'javascript',
        timeoutMs: 100,
      });
      expect(timeoutRes.error).toBeDefined();
    });
  });

  describe('Execute HTTP API & Sliding-Window Rate Limiting', () => {
    it('requires JWT auth, probes runtimes, validates Zod schema, and enforces 10 runs/min limit', async () => {
      const unauthRes = await fetch(`${baseUrl}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'console.log(1)', language: 'javascript' }),
      });
      expect(unauthRes.status).toBe(401);

      const runtimesRes = await fetch(`${baseUrl}/api/execute/runtimes`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      expect(runtimesRes.status).toBe(200);
      const runtimesBody = (await runtimesRes.json()) as { runtimes: Array<{ language: string; available: boolean }> };
      expect(runtimesBody.runtimes.find((r) => r.language === 'javascript')?.available).toBe(true);

      const invalidLangRes = await fetch(`${baseUrl}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
        body: JSON.stringify({ code: '1+1', language: 'unsupported_lang_999' }),
      });
      expect(invalidLangRes.status).toBe(400);
      const invalidBody = (await invalidLangRes.json()) as { message: string; errors: unknown[] };
      expect(invalidBody.message).toBe('Validation failed');
      expect(Array.isArray(invalidBody.errors)).toBe(true);

      const execRes = await fetch(`${baseUrl}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
        body: JSON.stringify({ code: 'console.log("API OK");', language: 'javascript', fileName: 'run.js' }),
      });
      expect(execRes.status).toBe(200);
      expect(((await execRes.json()) as any).stdout).toEqual(['API OK']);

      // Exhaust 10/min rate limit on isolated user
      for (let i = 0; i < 10; i++) {
        const res = await fetch(`${baseUrl}/api/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rateLimitUserToken}` },
          body: JSON.stringify({ code: '1', language: 'javascript' }),
        });
        expect(res.status).toBe(200);
      }

      const throttledRes = await fetch(`${baseUrl}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rateLimitUserToken}` },
        body: JSON.stringify({ code: '1', language: 'javascript' }),
      });
      expect(throttledRes.status).toBe(429);
    });
  });
});
