import { app, BrowserWindow, shell, ipcMain, Menu, MenuItemConstructorOptions } from 'electron';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath, pathToFileURL } from 'url';

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
    path.join(__dirname, 'preload.mjs'),
    path.join(__dirname, 'preload.js'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(__dirname, 'preload.cjs');
}

/**
 * Checks whether a navigation target belongs to the local application.
 * All external services (including OAuth identity providers) are delegated
 * to the user's default system browser for secure authentication.
 */
function isAllowedInternalNavigation(url: string, localOrigin?: string): boolean {
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
 * in packaged production mode, providing an http:// origin for OAuth redirects.
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
        let requestPath = decodeURIComponent(parsedUrl.pathname);
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
          // SPA Fallback: serve index.html for client routes (/sso-callback, /dashboard, etc.)
          const indexPath = path.join(clientDistPath, 'index.html');
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          fs.createReadStream(indexPath).pipe(res);
        }
      } catch (err) {
        res.statusCode = 500;
        res.end('Internal Server Error');
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
      const parsed = new URL(url);
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
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url);
      }
    } catch {}
    return { action: 'deny' };
  });

  // Navigation guard: allow app, Clerk, and OAuth identity provider navigations; open external links in default browser
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (isAllowedInternalNavigation(navigationUrl, currentAppUrl)) {
      return;
    }
    event.preventDefault();
    try {
      const parsed = new URL(navigationUrl);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(navigationUrl);
      }
    } catch {}
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
  });
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

  ipcMain.handle('obsidian:open-external', async (_event, targetUrl: string) => {
    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        await shell.openExternal(targetUrl);
        return true;
      }
    } catch {
      // Disallowed URL
    }
    return false;
  });

  ipcMain.handle('obsidian:get-platform', () => {
    return process.platform;
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
