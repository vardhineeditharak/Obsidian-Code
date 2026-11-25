import http from 'node:http';
import path from 'node:path';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { connectDB, disconnectDB, pingDB } from './db';
import { authRoutes } from './routes/authRoutes';
import { projectRoutes } from './routes/projectRoutes';
import { fileRoutes } from './routes/fileRoutes';
import { versionRoutes } from './routes/versionRoutes';
import { invitationRoutes } from './routes/invitationRoutes';
import { executeRoutes } from './routes/executeRoutes';
import { YjsWebSocketServer } from './websocket/yjsServer';

const app = express();
app.disable('x-powered-by');

const server = http.createServer(app);
const yjsServer = new YjsWebSocketServer(server);

// Baseline security headers
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Body parsing & cookies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb', parameterLimit: 1000 }));
app.use(cookieParser());

// Explicit CORS origin allowlist
const allowedOrigins = new Set<string>();
function registerAllowedOrigin(raw: string | undefined): void {
  if (!raw) return;
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    try {
      allowedOrigins.add(new URL(trimmed).origin);
    } catch {
      allowedOrigins.add(trimmed);
    }
  }
}
registerAllowedOrigin(config.CLIENT_ORIGIN);
registerAllowedOrigin(config.APP_URL);

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

// Health Check Endpoint
app.get('/healthz', async (_req: Request, res: Response) => {
  const dbStatus = await pingDB();
  const isHealthy = dbStatus.connected || config.NODE_ENV !== 'production';
  return res.status(isHealthy ? 200 : 503).json({
    status: dbStatus.connected ? 'ok' : 'degraded',
    service: 'Obsidian Code',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    database: dbStatus,
  });
});

// REST API Endpoints
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api', fileRoutes);
app.use('/api', versionRoutes);
app.use('/api', invitationRoutes);
app.use('/api/execute', executeRoutes);

// WebSocket Upgrade Handling (/ws or /obsidian-project-*)
server.on('upgrade', (request, socket, head) => {
  try {
    const pathname = new URL(
      request.url || '',
      `http://${request.headers.host || 'localhost'}`
    ).pathname;
    if (pathname.startsWith('/ws') || pathname.startsWith('/obsidian-project-')) {
      void yjsServer.authenticateAndUpgrade(request, socket, head);
    } else {
      socket.destroy();
    }
  } catch {
    socket.destroy();
  }
});

// Serve compiled static assets from Vite (in production)
const clientDistPath = path.resolve(process.cwd(), 'dist/client');
app.use(express.static(clientDistPath, { dotfiles: 'deny' }));

// SPA Fallback & API 404 Handler
app.use((req: Request, res: Response) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
    return res.status(404).json({ message: 'Not found' });
  }
  const indexPath = path.join(clientDistPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(200).send(`<!DOCTYPE html>
<html>
  <head><title>Obsidian Code</title></head>
  <body style="background:#f7f7f4;color:#26251e;font-family:sans-serif;padding:40px;text-align:center;">
    <h1>Obsidian Code Server Running</h1>
    <p>API and WebSocket server active on port ${config.PORT}.</p>
    <p>Vite dev client runs on <a href="http://localhost:3000" style="color:#f54e00;">http://localhost:3000</a></p>
  </body>
</html>`);
    }
  });
});

// Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON request body' });
  }
  console.error('[Server Error]', err);
  const status = err?.status || err?.statusCode || 500;
  return res.status(status).json({
    message: status >= 500 ? 'Internal server error' : err?.message || 'An error occurred',
  });
});

const PORT = parseInt(process.env.PORT || config.PORT, 10);
const HOST = '0.0.0.0';

async function start(): Promise<void> {
  const connected = await connectDB();
  if (!connected && config.NODE_ENV === 'production') {
    console.error(
      'CRITICAL: MongoDB is unavailable in production. Refusing to start with the volatile in-memory fallback.'
    );
    process.exit(1);
  }

  server.listen(PORT, HOST, () => {
    console.log('===============================================');
    console.log(`  Obsidian Code Server running on http://${HOST}:${PORT}`);
    console.log(`  WebSocket Yjs Endpoint on ws://${HOST}:${PORT}/ws`);
    console.log(`  Health Check: http://${HOST}:${PORT}/healthz`);
    console.log('===============================================');
  });
}

let shuttingDown = false;
function handleShutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}. Shutting down gracefully...`);

  const forceTimer = setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10_000);
  forceTimer.unref();

  yjsServer.getWss().clients.forEach((client) => client.close(1001, 'Server shutting down'));
  yjsServer.getWss().close();

  server.close(async () => {
    await disconnectDB().catch(() => {});
    console.log('HTTP, WebSocket, and database connections closed.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

void start();
