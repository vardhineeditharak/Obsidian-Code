import http from 'http';
import path from 'path';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { connectDB, getDBStatus, pingDB } from './db';
import { authRoutes } from './routes/authRoutes';
import { projectRoutes } from './routes/projectRoutes';
import { fileRoutes } from './routes/fileRoutes';
import { versionRoutes } from './routes/versionRoutes';
import { invitationRoutes } from './routes/invitationRoutes';
import { executeRoutes } from './routes/executeRoutes';
import { YjsWebSocketServer } from './websocket/yjsServer';

import { logRuntimeSecurityAudit, checkNodeRuntimeSecurity } from './security/runtimeAudit';

const app = express();
const server = http.createServer(app);

// Run runtime security check on boot
logRuntimeSecurityAudit();

// Initialize Yjs WebSocket Server attached to HTTP server
const yjsServer = new YjsWebSocketServer(server);

// Mandatory HTTP Security Headers (CWE-693 / Clickjacking & MIME-Sniffing Defense)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  next();
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
const allowedOrigins = new Set<string>();
if (config.CLIENT_ORIGIN) {
  try {
    allowedOrigins.add(new URL(config.CLIENT_ORIGIN).origin);
  } catch {
    allowedOrigins.add(config.CLIENT_ORIGIN);
  }
}
if (config.APP_URL) {
  try {
    allowedOrigins.add(new URL(config.APP_URL).origin);
  } catch {
    allowedOrigins.add(config.APP_URL);
  }
}
allowedOrigins.add('http://localhost:3000');
allowedOrigins.add('http://127.0.0.1:3000');

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like same-origin server requests, curl, or mobile apps)
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);

// Health Check Endpoint for Render & Uptime Monitors
app.get('/healthz', async (_req, res) => {
  const dbStatus = await pingDB();
  const securityStatus = checkNodeRuntimeSecurity();
  const isHealthy = (dbStatus.connected || config.NODE_ENV !== 'production') && securityStatus.secure;
  return res.status(isHealthy ? 200 : 503).json({
    status: dbStatus.connected ? 'ok' : 'degraded',
    service: 'Obsidian Code',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    database: dbStatus,
    runtimeSecurity: securityStatus,
  });
});

// REST API Endpoints
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api', fileRoutes);
app.use('/api', versionRoutes);
app.use('/api', invitationRoutes);
app.use('/api/execute', executeRoutes);

// Upgrade WebSocket connections on /ws or rooms
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`).pathname;
  if (pathname.startsWith('/ws') || pathname.startsWith('/obsidian-project-')) {
    yjsServer.authenticateAndUpgrade(request, socket, head);
  } else {
    socket.destroy();
  }
});

// Serve compiled static assets from Vite (in production)
const clientDistPath = path.resolve(process.cwd(), 'dist/client');
app.use(express.static(clientDistPath));

// SPA Fallback: serve index.html for non-API/non-WS requests
app.use((req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
    return res.status(404).json({ message: 'Not found' });
  }
  const indexPath = path.join(clientDistPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      // In dev mode when client isn't built yet
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Obsidian Code</title></head>
          <body style="background:#f7f7f4;color:#26251e;font-family:sans-serif;padding:40px;text-align:center;">
            <h1>Obsidian Code Server Running</h1>
            <p>API and WebSocket server active on port ${config.PORT}.</p>
            <p>Vite dev client runs on <a href="http://localhost:3000" style="color:#f54e00;">http://localhost:3000</a></p>
          </body>
        </html>
      `);
    }
  });
});

// Global Error Handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]', err);
  const status = err.status || err.statusCode || 500;
  return res.status(status).json({
    message: status === 500 ? 'Internal server error' : err.message || 'An error occurred',
  });
});

// Server Initialization
const PORT = parseInt(process.env.PORT || config.PORT, 10);
const HOST = '0.0.0.0';

async function start() {
  await connectDB();

  server.listen(PORT, HOST, () => {
    console.log(`===============================================`);
    console.log(`  Obsidian Code Server running on http://${HOST}:${PORT}`);
    console.log(`  WebSocket Yjs Endpoint on ws://${HOST}:${PORT}/ws`);
    console.log(`  Health Check: http://${HOST}:${PORT}/healthz`);
    console.log(`===============================================`);
  });
}

// Graceful Shutdown Handling (SIGTERM & SIGINT)
function handleShutdown(signal: string) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('HTTP and WebSocket server closed.');
    process.exit(0);
  });

  // Force shutdown after 10s timeout
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

start();
