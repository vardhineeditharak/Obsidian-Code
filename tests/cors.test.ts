import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { AddressInfo } from 'net';
import { config } from '../server/config';

describe('CORS Origin Handling (BUG-7)', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    const allowedOrigins = new Set<string>();
    if (config.CLIENT_ORIGIN) allowedOrigins.add(new URL(config.CLIENT_ORIGIN).origin);
    if (config.APP_URL) allowedOrigins.add(new URL(config.APP_URL).origin);

    app.use(
      cors({
        origin: (origin, callback) => {
          if (!origin) return callback(null, true);
          if (allowedOrigins.has(origin)) {
            return callback(null, true);
          }
          return callback(null, false);
        },
        credentials: true,
      })
    );

    app.get('/test-cors', (_req, res) => {
      res.json({ ok: true });
    });

    // Global error handler
    app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const status = err.status || 500;
      res.status(status).json({ message: err.message || 'Error' });
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as AddressInfo).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('allows configured client origin and sets Access-Control-Allow-Origin header', async () => {
    const res = await fetch(`${baseUrl}/test-cors`, {
      headers: { Origin: config.CLIENT_ORIGIN },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(config.CLIENT_ORIGIN);
  });

  it('handles blocked origin without throwing an unhandled 500 server error', async () => {
    const res = await fetch(`${baseUrl}/test-cors`, {
      headers: { Origin: 'http://unauthorized-malicious-origin.com' },
    });
    // Request must not be 500; origin header must not be allowed
    expect(res.status).not.toBe(500);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
