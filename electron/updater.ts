import { app, dialog, BrowserWindow, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import https from 'https';

export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  releaseNotes?: string;
}

function getAppVersion(): string {
  try {
    return app?.getVersion?.() || '1.1.0';
  } catch {
    return '1.1.0';
  }
}

function isAppPackaged(): boolean {
  try {
    return Boolean(app?.isPackaged);
  } catch {
    return false;
  }
}

export class DesktopAppUpdater {
  private mainWindow: BrowserWindow | null = null;
  private isChecking = false;

  constructor() {
    this.setupAutoUpdater();
  }

  public setWindow(win: BrowserWindow | null) {
    this.mainWindow = win;
  }

  private setupAutoUpdater() {
    if (!app || typeof app.getVersion !== 'function') {
      return;
    }

    try {
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      console.log('[AutoUpdater] Checking for updates on remote release channel...');
    });

    autoUpdater.on('update-available', (info) => {
      console.log('[AutoUpdater] Update available:', info.version);
      this.notifyRenderer('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
      });

      this.promptDownloadUpdate(info.version, typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined);
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log('[AutoUpdater] Application is up-to-date (v' + (info.version || app.getVersion()) + ')');
      this.notifyRenderer('update-not-available', { version: info.version || app.getVersion() });
    });

    autoUpdater.on('download-progress', (progressObj) => {
      console.log(`[AutoUpdater] Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}%`);
      this.notifyRenderer('download-progress', {
        percent: Math.round(progressObj.percent),
        transferred: progressObj.transferred,
        total: progressObj.total,
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('[AutoUpdater] Update downloaded successfully:', info.version);
      this.notifyRenderer('update-downloaded', { version: info.version });
      this.promptInstallUpdate(info.version);
    });

    autoUpdater.on('error', (err) => {
      console.warn('[AutoUpdater] Auto-updater notice:', err?.message || err);
      this.notifyRenderer('update-error', { error: err?.message || 'Update check failed' });
    });
    } catch (err) {
      console.warn('[AutoUpdater] Could not initialize autoUpdater:', err);
    }
  }

  private notifyRenderer(event: string, data: any) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(`obsidian:update:${event}`, data);
    }
  }

  /**
   * Prompts user with native dialog when an update is available.
   */
  private async promptDownloadUpdate(version: string, releaseNotes?: string) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    const currentVersion = getAppVersion();
    const result = await dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Obsidian Code Update Available',
      message: `A new version of Obsidian Code is available!`,
      detail: `Version v${version} is now available (you are currently running v${currentVersion}).\n\n${
        releaseNotes
          ? `Release highlights:\n${releaseNotes.slice(0, 300)}...`
          : 'Would you like to download and install this update?'
      }`,
      buttons: ['Download Update', 'Remind Me Later'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });

    if (result.response === 0) {
      this.notifyRenderer('download-starting', { version });
      autoUpdater.downloadUpdate().catch((err) => {
        console.error('[AutoUpdater] Failed to download update:', err);
      });
    }
  }

  /**
   * Prompts user with native dialog when update has finished downloading.
   */
  private async promptInstallUpdate(version: string) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    const result = await dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Update Ready to Install',
      message: `Obsidian Code v${version} has been downloaded.`,
      detail: 'Restart the application now to complete the update installation.',
      buttons: ['Restart & Install', 'Install on Exit'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  }

  /**
   * Manually check for updates (e.g. from Menu or Settings).
   * Supports both packaged auto-updater and fallback GitHub API check.
   */
  public async checkForUpdates(manual: boolean = false): Promise<UpdateCheckResult> {
    if (this.isChecking) {
      return { updateAvailable: false, currentVersion: getAppVersion() };
    }
    this.isChecking = true;

    try {
      if (isAppPackaged()) {
        // In production: trigger electron-updater
        const checkPromise = autoUpdater.checkForUpdates();
        const result = await checkPromise;
        const latestVersion = result?.updateInfo?.version;
        const currentVersion = getAppVersion();

        const hasUpdate = latestVersion && latestVersion !== currentVersion;
        if (manual && !hasUpdate && this.mainWindow && !this.mainWindow.isDestroyed()) {
          await dialog.showMessageBox(this.mainWindow, {
            type: 'info',
            title: 'No Updates Available',
            message: "You're up to date!",
            detail: `Obsidian Code v${currentVersion} is currently the newest version available.`,
            buttons: ['OK'],
          });
        }

        return {
          updateAvailable: Boolean(hasUpdate),
          currentVersion,
          latestVersion: latestVersion || currentVersion,
        };
      } else {
        // In development or when unpackaged: check GitHub Releases API
        const gitHubResult = await this.checkGitHubReleases();
        if (manual && this.mainWindow && !this.mainWindow.isDestroyed()) {
          if (gitHubResult.updateAvailable) {
            const res = await dialog.showMessageBox(this.mainWindow, {
              type: 'info',
              title: 'New Release Available',
              message: `Obsidian Code v${gitHubResult.latestVersion} is available!`,
              detail: `You are currently running v${gitHubResult.currentVersion}.\n\nWould you like to open the GitHub Release page to download the latest setup installer?`,
              buttons: ['View Release', 'Close'],
              defaultId: 0,
              cancelId: 1,
            });
            if (res.response === 0 && gitHubResult.releaseUrl) {
              shell.openExternal(gitHubResult.releaseUrl);
            }
          } else {
            await dialog.showMessageBox(this.mainWindow, {
              type: 'info',
              title: 'No Updates Available',
              message: "You're up to date!",
              detail: `Obsidian Code v${gitHubResult.currentVersion} is currently the newest version available.`,
              buttons: ['OK'],
            });
          }
        }
        return gitHubResult;
      }
    } catch (err: any) {
      console.warn('[AutoUpdater] Primary check error, querying GitHub Releases API:', err?.message || err);
      // Fallback to GitHub Releases API check
      const gitHubResult: UpdateCheckResult = await this.checkGitHubReleases().catch(() => ({
        updateAvailable: false,
        currentVersion: getAppVersion(),
        latestVersion: undefined,
        releaseUrl: undefined,
        releaseNotes: undefined,
      }));

      if (manual && this.mainWindow && !this.mainWindow.isDestroyed()) {
        if (gitHubResult.updateAvailable) {
          const res = await dialog.showMessageBox(this.mainWindow, {
            type: 'info',
            title: 'New Release Available',
            message: `Obsidian Code v${gitHubResult.latestVersion} is available!`,
            detail: `You are running v${gitHubResult.currentVersion}.\n\nWould you like to open the release page?`,
            buttons: ['View Release', 'Close'],
          });
          if (res.response === 0 && gitHubResult.releaseUrl) {
            shell.openExternal(gitHubResult.releaseUrl);
          }
        } else {
          await dialog.showMessageBox(this.mainWindow, {
            type: 'info',
            title: 'No Updates Available',
            message: "You're up to date!",
            detail: `Obsidian Code v${gitHubResult.currentVersion} is currently the newest version available.`,
            buttons: ['OK'],
          });
        }
      }

      return gitHubResult;
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Queries GitHub Releases API directly for the latest release tag
   */
  private checkGitHubReleases(): Promise<UpdateCheckResult> {
    return new Promise((resolve) => {
      const currentVersion = getAppVersion();
      const options = {
        hostname: 'api.github.com',
        path: '/repos/vardhineeditharak/Obsidian-Code/releases/latest',
        method: 'GET',
        headers: {
          'User-Agent': `Obsidian-Code-Desktop/${currentVersion}`,
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const release = JSON.parse(data);
              const tagName: string = release.tag_name || '';
              const latestVersion = tagName.replace(/^v/, '');
              const isNewer = this.compareSemver(latestVersion, currentVersion) > 0;

              return resolve({
                updateAvailable: isNewer,
                currentVersion,
                latestVersion,
                releaseUrl: release.html_url,
                releaseNotes: release.body,
              });
            }
          } catch {}
          resolve({ updateAvailable: false, currentVersion });
        });
      });

      req.on('error', () => {
        resolve({ updateAvailable: false, currentVersion });
      });

      req.setTimeout(5000, () => {
        req.destroy();
        resolve({ updateAvailable: false, currentVersion });
      });

      req.end();
    });
  }

  /**
   * Compares two semantic version strings (a vs b).
   * Returns > 0 if a > b, < 0 if a < b, 0 if equal.
   */
  private compareSemver(a: string, b: string): number {
    const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
    const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
    for (let i = 0; i < 3; i++) {
      const diff = (pa[i] || 0) - (pb[i] || 0);
      if (diff !== 0) return diff;
    }
    return 0;
  }

  public quitAndInstall() {
    autoUpdater.quitAndInstall(false, true);
  }
}

export const appUpdater = new DesktopAppUpdater();
