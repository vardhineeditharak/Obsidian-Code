import { app, BrowserWindow, shell, ipcMain, Menu, MenuItemConstructorOptions } from 'electron';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath, pathToFileURL } from 'url';
import { appUpdater } from './updater';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let localServer: http.Server | null = null;
let currentAppUrl = '';

// Register custom protocol client for deep linking (obsidian-code:// and obsidian://)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    try {
      app.setAsDefaultProtocolClient('obsidian-code', process.execPath, [path.resolve(process.argv[1])]);
      app.setAsDefaultProtocolClient('obsidian', process.execPath, [path.resolve(process.argv[1])]);
    } catch {}
  }
} else {
  try {
    app.setAsDefaultProtocolClient('obsidian-code');
    app.setAsDefaultProtocolClient('obsidian');
  } catch {}
}

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();

      // Check for deep link protocol URL in arguments (Windows/Linux)
      const protocolUrl = commandLine.find(
        (arg) => arg.startsWith('obsidian-code://') || arg.startsWith('obsidian://')
      );
      if (protocolUrl) {
        mainWindow.webContents.send('obsidian:protocol-url', protocolUrl);
      }
    }
  });
}

// macOS deep link protocol handler
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow) {
    if (!mainWindow.isVisible()) mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    mainWindow.webContents.send('obsidian:protocol-url', url);
  }
});

function resolvePreloadPath(): string {
  const possiblePaths = [
    path.join(__dirname, 'preload.cjs'),
    path.join(__dirname, 'preload.js'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(__dirname, 'preload.cjs');
}

/**
 * Robustly launches a URL in the user's default system browser.
 * On Windows, leverages cmd.exe start to ensure the external browser
 * launches reliably across all elevation and protocol association states.
 */
async function openInExternalBrowser(rawUrl: unknown): Promise<boolean> {
  const targetUrl = typeof rawUrl === 'string'
    ? rawUrl.trim()
    : typeof (rawUrl as any)?.href === 'string'
    ? (rawUrl as any).href.trim()
    : String(rawUrl || '').trim();

  if (!targetUrl) {
    console.warn('[Electron] openInExternalBrowser: empty URL received');
    return false;
  }

  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      console.warn('[Electron] openInExternalBrowser: disallowed protocol', parsed.protocol);
      return false;
    }
  } catch (err) {
    console.error('[Electron] openInExternalBrowser: invalid URL format', targetUrl, err);
    return false;
  }

  console.log('[Electron] Requesting external system browser for:', targetUrl);

  // 1. Primary: Electron's native shell.openExternal
  // Uses Windows ShellExecuteExW directly, preserving all '&' query parameters intact without cmd.exe shell splitting
  try {
    await shell.openExternal(targetUrl, { activate: true });
    console.log('[Electron] shell.openExternal succeeded for:', targetUrl);
    return true;
  } catch (shellErr) {
    console.warn('[Electron] shell.openExternal threw error, attempting fallback:', shellErr);
  }

  // 2. Windows Fallback: safely quote the URL to prevent cmd.exe from splitting on '&'
  if (process.platform === 'win32') {
    try {
      const { exec } = await import('child_process');
      const safeUrl = targetUrl.replace(/"/g, '""');
      exec(`start "" "${safeUrl}"`);
      console.log('[Electron] Fallback Windows start command executed');
      return true;
    } catch (cmdErr) {
      console.warn('[Electron] Fallback Windows start failed:', cmdErr);
    }
  }

  // 3. macOS / Linux fallbacks
  try {
    const { spawn } = await import('child_process');
    if (process.platform === 'darwin') {
      const child = spawn('open', [targetUrl], { detached: true, stdio: 'ignore' });
      child.unref();
      return true;
    } else if (process.platform === 'linux') {
      const child = spawn('xdg-open', [targetUrl], { detached: true, stdio: 'ignore' });
      child.unref();
      return true;
    }
  } catch (fallbackErr) {
    console.error('[Electron] Native fallback execution failed:', fallbackErr);
  }

  return false;
}

/**
 * Checks whether a navigation target belongs to the local application.
 * All external services (including OAuth identity providers and desktop auth routes)
 * are delegated to the user's default system browser.
 */
function isAllowedInternalNavigation(url: string, localOrigin?: string): boolean {
  // Desktop auth endpoints MUST always open in the external system browser!
  if (url.includes('/desktop-auth') || url.includes('/desktop-callback')) {
    return false;
  }
  if (localOrigin && url.startsWith(localOrigin)) return true;
  try {
    const { hostname } = new URL(url);
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Starts a lightweight local loopback HTTP server to serve the client assets
 * in packaged production mode, providing an http:// origin for OAuth redirects,
 * and seamlessly proxying /api and /ws requests to the Obsidian Code backend server.
 */
function startLocalServer(clientDistPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.mjs': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff2': 'font/woff2',
      '.woff': 'font/woff',
      '.ttf': 'font/ttf',
    };

    const server = http.createServer((req, res) => {
      try {
        const parsedUrl = new URL(req.url || '/', 'http://localhost');
        const pathname = decodeURIComponent(parsedUrl.pathname);

        // 1. Proxy API endpoints (/api/*) directly to the backend Express server (:5000)
        if (pathname.startsWith('/api')) {
          const targetHost = '127.0.0.1';
          const targetPort = 5000;

          const proxyReq = http.request(
            {
              hostname: targetHost,
              port: targetPort,
              path: req.url,
              method: req.method,
              headers: {
                ...req.headers,
                host: `${targetHost}:${targetPort}`,
              },
            },
            (proxyRes) => {
              res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
              proxyRes.pipe(res);
            }
          );

          proxyReq.on('error', (proxyErr) => {
            console.error('[Electron localServer] Failed to proxy API request:', proxyErr.message);
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                message: 'Obsidian Code backend server is unavailable on port 5000. Please ensure the server is running.',
              })
            );
          });

          req.pipe(proxyReq);
          return;
        }

        // 2. Reject WebSocket HTTP requests (should use upgrade handler)
        if (pathname.startsWith('/ws')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'WebSocket handshake required' }));
          return;
        }

        // 3. Serve static assets
        let requestPath = pathname;
        if (requestPath === '/' || requestPath === '') {
          requestPath = '/index.html';
        }

        const safePath = path.normalize(requestPath).replace(/^(\.\.[\/\\])+/, '');
        const targetFile = path.join(clientDistPath, safePath);

        if (fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
          const ext = path.extname(targetFile).toLowerCase();
          res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
          fs.createReadStream(targetFile).pipe(res);
        } else {
          // SPA Fallback: serve index.html for client routes (/sso-callback, /dashboard, /desktop-callback, etc.)
          const indexPath = path.join(clientDistPath, 'index.html');
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          fs.createReadStream(indexPath).pipe(res);
        }
      } catch (err) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    });

    // Proxy WebSocket upgrade connections to backend server
    server.on('upgrade', (req, socket, head) => {
      const parsedUrl = new URL(req.url || '/', 'http://localhost');
      if (parsedUrl.pathname.startsWith('/ws') || parsedUrl.pathname.startsWith('/obsidian-project-')) {
        const proxyReq = http.request({
          hostname: '127.0.0.1',
          port: 5000,
          path: req.url,
          method: 'GET',
          headers: {
            ...req.headers,
            host: '127.0.0.1:5000',
          },
        });

        proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
          socket.write(
            `HTTP/${proxyRes.httpVersion} ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n` +
              Object.entries(proxyRes.headers)
                .map(([k, v]) => `${k}: ${v}`)
                .join('\r\n') +
              '\r\n\r\n'
          );
          if (proxyHead && proxyHead.length) socket.write(proxyHead);
          proxySocket.pipe(socket);
          socket.pipe(proxySocket);
        });

        proxyReq.on('error', () => {
          socket.destroy();
        });

        proxyReq.end();
      } else {
        socket.destroy();
      }
    });

    // Prefer port 3000 (pre-allowlisted in Clerk development instances)
    server.listen(3000, '127.0.0.1', () => {
      localServer = server;
      resolve('http://localhost:3000');
    }).on('error', () => {
      // If 3000 is occupied, pick an available ephemeral port
      server.listen(0, '127.0.0.1', () => {
        localServer = server;
        const addr = server.address() as any;
        resolve(`http://localhost:${addr.port}`);
      }).on('error', (err) => {
        reject(err);
      });
    });
  });
}

function createApplicationMenu() {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              {
                label: 'Check for Updates...',
                click: () => {
                  appUpdater.checkForUpdates(true);
                },
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' as const } : { role: 'quit' as const, label: 'Exit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
              { type: 'separator' as const },
              { role: 'window' as const },
            ]
          : [{ role: 'close' as const }]),
      ],
    },
    {
      role: 'help' as const,
      submenu: [
        {
          label: 'Check for Updates...',
          click: () => {
            appUpdater.checkForUpdates(true);
          },
        },
        { type: 'separator' as const },
        {
          label: 'Obsidian Code Documentation',
          click: async () => {
            await shell.openExternal('https://github.com/vardhineeditharak/Obsidian-Code#readme');
          },
        },
        {
          label: 'Report Issue...',
          click: async () => {
            await shell.openExternal('https://github.com/vardhineeditharak/Obsidian-Code/issues');
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Obsidian Code',
    backgroundColor: '#1c1b17',
    show: true,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,
    webPreferences: {
      preload: resolvePreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  // Strip Electron identifier from User-Agent to prevent Google OAuth "Disallowed Useragent" block
  const standardUserAgent = mainWindow.webContents
    .getUserAgent()
    .replace(/Electron\/\S+\s?/, '')
    .replace(/Obsidian Code\/\S+\s?/, '');
  mainWindow.webContents.setUserAgent(standardUserAgent);

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Electron] Failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
  });

  // Handle window popups (allow OAuth authentication windows, open external links in browser)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (isAllowedInternalNavigation(url)) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 600,
            height: 750,
            autoHideMenuBar: true,
            webPreferences: {
              sandbox: true,
            },
          },
        };
      }
      openInExternalBrowser(url);
    } catch (err) {
      console.warn('[Electron] setWindowOpenHandler error:', err);
    }
    return { action: 'deny' };
  });

  // Navigation guard: allow app internal navigations; delegate external links and auth to default browser
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (isAllowedInternalNavigation(navigationUrl, currentAppUrl)) {
      return;
    }
    event.preventDefault();
    openInExternalBrowser(navigationUrl);
  });

  // Window state notification to renderer
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('obsidian:window:maximize-change', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('obsidian:window:maximize-change', false);
  });

  // Load renderer (dev server in development, local loopback server in production)
  if (process.env.VITE_DEV_SERVER_URL) {
    currentAppUrl = process.env.VITE_DEV_SERVER_URL;
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL).catch((err) => {
      console.error('[Electron] Failed to load URL:', err);
    });
  } else {
    const clientDistPath = path.resolve(__dirname, '../dist/client');
    startLocalServer(clientDistPath)
      .then((serverUrl) => {
        currentAppUrl = serverUrl;
        mainWindow?.loadURL(serverUrl).catch((err) => {
          console.error('[Electron] Failed to load local server URL:', serverUrl, err);
        });
      })
      .catch((err) => {
        console.error('[Electron] Failed to start local loopback server, falling back to file protocol:', err);
        const indexPath = path.resolve(__dirname, '../dist/client/index.html');
        mainWindow?.loadURL(pathToFileURL(indexPath).href);
      });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    appUpdater.setWindow(null);
  });

  // Attach window to updater and perform silent background update check after launch
  appUpdater.setWindow(mainWindow);
  setTimeout(() => {
    appUpdater.checkForUpdates(false).catch((err) => {
      console.warn('[AutoUpdater] Startup update check notice:', err);
    });
  }, 3500);
}

// IPC Handlers for renderer controls
function registerIpcHandlers() {
  ipcMain.on('obsidian:window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.on('obsidian:window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on('obsidian:window:close', () => {
    mainWindow?.close();
  });

  ipcMain.on('obsidian:window:focus', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  ipcMain.handle('obsidian:window:is-maximized', () => {
    return mainWindow?.isMaximized() ?? false;
  });

  ipcMain.handle('obsidian:open-external', async (_event, targetUrl: unknown) => {
    return openInExternalBrowser(targetUrl);
  });

  ipcMain.handle('obsidian:get-platform', () => {
    return process.platform;
  });

  ipcMain.handle('obsidian:check-for-updates', () => {
    return appUpdater.checkForUpdates(true);
  });

  ipcMain.on('obsidian:restart-and-install-update', () => {
    appUpdater.quitAndInstall();
  });

  ipcMain.handle('obsidian:get-version', () => {
    return app.getVersion();
  });
}

// App lifecycle
app.whenReady().then(() => {
  registerIpcHandlers();
  createApplicationMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  if (localServer) {
    localServer.close();
    localServer = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
