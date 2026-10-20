import { contextBridge, ipcRenderer } from 'electron';

export interface ObsidianDesktopAPI {
  platform: 'win32' | 'darwin' | 'linux';
  isDesktop: boolean;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximizeChange: (callback: (isMaximized: boolean) => void) => () => void;
  openExternal: (url: string) => Promise<boolean>;
  onProtocolUrl: (callback: (url: string) => void) => () => void;
  focusWindow: () => void;
  checkForUpdates: () => Promise<{
    updateAvailable: boolean;
    currentVersion: string;
    latestVersion?: string;
    releaseUrl?: string;
    releaseNotes?: string;
  }>;
  restartAndInstallUpdate: () => void;
  onUpdateStatus: (callback: (status: { type: string; version?: string; percent?: number; error?: string }) => void) => () => void;
  getVersion: () => Promise<string>;
}

const desktopAPI: ObsidianDesktopAPI = {
  platform: process.platform as 'win32' | 'darwin' | 'linux',
  isDesktop: true,
  minimize: () => {
    ipcRenderer.send('obsidian:window:minimize');
  },
  maximize: () => {
    ipcRenderer.send('obsidian:window:maximize');
  },
  close: () => {
    ipcRenderer.send('obsidian:window:close');
  },
  isMaximized: () => {
    return ipcRenderer.invoke('obsidian:window:is-maximized');
  },
  onMaximizeChange: (callback: (isMaximized: boolean) => void) => {
    const listener = (_event: any, isMax: boolean) => callback(isMax);
    ipcRenderer.on('obsidian:window:maximize-change', listener);
    return () => {
      ipcRenderer.removeListener('obsidian:window:maximize-change', listener);
    };
  },
  openExternal: (url: string) => {
    return ipcRenderer.invoke('obsidian:open-external', url);
  },
  onProtocolUrl: (callback: (url: string) => void) => {
    const listener = (_event: any, url: string) => callback(url);
    ipcRenderer.on('obsidian:protocol-url', listener);
    return () => {
      ipcRenderer.removeListener('obsidian:protocol-url', listener);
    };
  },
  focusWindow: () => {
    ipcRenderer.send('obsidian:window:focus');
  },
  checkForUpdates: () => {
    return ipcRenderer.invoke('obsidian:check-for-updates');
  },
  restartAndInstallUpdate: () => {
    ipcRenderer.send('obsidian:restart-and-install-update');
  },
  onUpdateStatus: (callback: (status: { type: string; version?: string; percent?: number; error?: string }) => void) => {
    const eventTypes = [
      'update-available',
      'update-not-available',
      'download-starting',
      'download-progress',
      'update-downloaded',
      'update-error',
    ];

    const cleanups = eventTypes.map((evt) => {
      const channel = `obsidian:update:${evt}`;
      const listener = (_e: any, data: any) => callback({ type: evt, ...data });
      ipcRenderer.on(channel, listener);
      return () => {
        ipcRenderer.removeListener(channel, listener);
      };
    });

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  },
  getVersion: () => {
    return ipcRenderer.invoke('obsidian:get-version');
  },
};

contextBridge.exposeInMainWorld('obsidianDesktop', desktopAPI);
