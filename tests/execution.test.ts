import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { AddressInfo } from 'net';
import { resolveLanguage, probe } from '../server/execution/languageRegistry';
import { runProcessCode } from '../server/execution/processRunner';
import { executeRoutes } from '../server/routes/executeRoutes';
import { config } from '../server/config';

describe('Multi-Language Process Execution (Phase 2)', () => {
  let server: http.Server;
  let baseUrl: string;
  let userToken: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/execute', executeRoutes);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as AddressInfo).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    userToken = jwt.sign(
      { userId: 'test-exec-user', email: 'exec@test.com', name: 'Exec User' },
      config.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('language registry probes and resolves supported languages', async () => {
    const runtimes = await probe();
    expect(Array.isArray(runtimes)).toBe(true);
    expect(runtimes.some((r) => r.language === 'javascript')).toBe(true);

    const jsResolved = await resolveLanguage('test.js');
    expect(jsResolved).not.toBeNull();
    expect(jsResolved?.language).toBe('javascript');
    expect(jsResolved?.available).toBe(true);

    const pyResolved = await resolveLanguage('script.py');
    expect(pyResolved).not.toBeNull();
    expect(pyResolved?.language).toBe('python');

    const unknownResolved = await resolveLanguage('unknown.xyz');
    expect(unknownResolved).toBeNull();
  }, 15000);

  it('processRunner executes JavaScript code and returns stdout and exitCode 0', async () => {
    const res = await runProcessCode({
      code: 'console.log("Hello from processRunner");',
      language: 'javascript',
    });

    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('Hello from processRunner');
    expect(res.error).toBeUndefined();
    expect(res.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('processRunner enforces execution timeout on runaway processes', async () => {
    const res = await runProcessCode({
      code: 'while (true) {}',
      language: 'javascript',
      runTimeoutMs: 1000,
    });

    expect(res.exitCode).toBe(124);
    expect(res.error).toContain('timed out');
  });

  it('GET /api/execute/runtimes returns toolchain capability list', async () => {
    const res = await fetch(`${baseUrl}/api/execute/runtimes`, {
      headers: {
        Authorization: `Bearer ${userToken}`,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { runtimes: any[] };
    expect(Array.isArray(body.runtimes)).toBe(true);
    const nodeRuntime = body.runtimes.find((r) => r.language === 'javascript');
    expect(nodeRuntime).toBeDefined();
    expect(nodeRuntime.available).toBe(true);
  });

  it('POST /api/execute runs code and returns execution result', async () => {
    const res = await fetch(`${baseUrl}/api/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        code: 'console.log("Testing POST execute API");',
        language: 'javascript',
        fileName: 'test.js',
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.exitCode).toBe(0);
    expect(body.stdout).toContain('Testing POST execute API');
  });

  it('POST /api/execute rejects unknown language with 400 and Zod issues', async () => {
    const res = await fetch(`${baseUrl}/api/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        code: 'some code',
        language: 'unsupported_lang_123',
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.message).toBe('Validation failed');
    expect(Array.isArray(body.errors)).toBe(true);
  });
});
