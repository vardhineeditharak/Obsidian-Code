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

declare global {
  interface Window {
    obsidianDesktop?: ObsidianDesktopAPI;
  }
}

export {};
