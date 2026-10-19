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
};

contextBridge.exposeInMainWorld('obsidianDesktop', desktopAPI);
