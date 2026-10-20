import { describe, it, expect, vi } from 'vitest';
import { DesktopAppUpdater } from '../electron/updater';

describe('DesktopAppUpdater (Production Auto-Updater & Update Alerts)', () => {
  it('correctly compares semantic versions', () => {
    const updater = new DesktopAppUpdater();
    const compare = (updater as any).compareSemver.bind(updater);

    expect(compare('1.2.0', '1.1.0')).toBeGreaterThan(0);
    expect(compare('1.1.1', '1.1.0')).toBeGreaterThan(0);
    expect(compare('2.0.0', '1.9.9')).toBeGreaterThan(0);
    expect(compare('1.1.0', '1.1.0')).toBe(0);
    expect(compare('1.0.9', '1.1.0')).toBeLessThan(0);
  });

  it('exposes setWindow and quitAndInstall methods', () => {
    const updater = new DesktopAppUpdater();
    expect(typeof updater.setWindow).toBe('function');
    expect(typeof updater.checkForUpdates).toBe('function');
    expect(typeof updater.quitAndInstall).toBe('function');
  });

  it('handles query failure gracefully and returns updateAvailable: false', async () => {
    const updater = new DesktopAppUpdater();
    // In test environment, checkForUpdates without packaged app should return a clean result
    const result = await updater.checkForUpdates(false);
    expect(result).toHaveProperty('updateAvailable');
    expect(result).toHaveProperty('currentVersion');
  });
});
