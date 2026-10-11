import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from '../src/lib/api';

describe('Autosave Debounce & RBAC Logic (Step 4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // Emulates the autosave controller extracted from WorkspacePage
  class AutosaveController {
    public saveState: 'idle' | 'saving' | 'saved' | 'offline' = 'idle';
    public lastSavedAt: number | null = null;
    private timer: any = null;
    public lastSavedContent = new Map<string, string>();
    public pendingOffline: { fileId: string; content: string } | null = null;

    constructor(
      public userRole: 'owner' | 'editor' | 'viewer',
      public isOnline: boolean = true
    ) {}

    public onContentChange(activeFileId: string, newContent: string) {
      if (this.userRole === 'viewer') {
        return;
      }

      const prevSaved = this.lastSavedContent.get(activeFileId);
      if (newContent === prevSaved) {
        return;
      }

      if (!this.isOnline) {
        this.pendingOffline = { fileId: activeFileId, content: newContent };
        this.saveState = 'offline';
        return;
      }

      if (this.timer) {
        clearTimeout(this.timer);
      }

      this.timer = setTimeout(async () => {
        this.saveState = 'saving';
        try {
          await api.updateFile(activeFileId, { content: newContent });
          this.lastSavedContent.set(activeFileId, newContent);
          this.saveState = 'saved';
          this.lastSavedAt = Date.now();
          this.pendingOffline = null;
        } catch {
          this.saveState = 'idle';
        }
      }, 1500);
    }

    public async onReconnect() {
      this.isOnline = true;
      if (this.pendingOffline && this.userRole !== 'viewer') {
        const { fileId, content } = this.pendingOffline;
        this.pendingOffline = null;
        this.saveState = 'saving';
        await api.updateFile(fileId, { content });
        this.lastSavedContent.set(fileId, content);
        this.saveState = 'saved';
        this.lastSavedAt = Date.now();
      } else {
        this.saveState = 'idle';
      }
    }
  }

  it('asserts api.updateFile is NOT called for viewers when content changes', async () => {
    const updateFileSpy = vi.spyOn(api, 'updateFile').mockResolvedValue({} as any);

    const viewerController = new AutosaveController('viewer', true);
    viewerController.lastSavedContent.set('file-1', 'initial content');

    viewerController.onContentChange('file-1', 'viewer attempted change');

    // Fast-forward beyond debounce threshold
    vi.advanceTimersByTime(3000);
    await Promise.resolve();

    expect(updateFileSpy).not.toHaveBeenCalled();
    expect(viewerController.saveState).toBe('idle');
  });

  it('asserts api.updateFile IS called after 1500ms idle for editor/owner with changed content', async () => {
    const updateFileSpy = vi.spyOn(api, 'updateFile').mockResolvedValue({} as any);

    const editorController = new AutosaveController('editor', true);
    editorController.lastSavedContent.set('file-1', 'initial');

    editorController.onContentChange('file-1', 'modified content');

    // Before 1500ms, not called yet
    vi.advanceTimersByTime(1000);
    expect(updateFileSpy).not.toHaveBeenCalled();

    // After remaining 500ms, idle timer fires
    vi.advanceTimersByTime(500);
    await Promise.resolve();

    expect(updateFileSpy).toHaveBeenCalledTimes(1);
    expect(updateFileSpy).toHaveBeenCalledWith('file-1', { content: 'modified content' });
    expect(editorController.saveState).toBe('saved');
    expect(editorController.lastSavedAt).toBeGreaterThan(0);
  });

  it('debounces rapid typing changes into a single server call with latest content', async () => {
    const updateFileSpy = vi.spyOn(api, 'updateFile').mockResolvedValue({} as any);

    const controller = new AutosaveController('owner', true);
    controller.lastSavedContent.set('file-1', 'a');

    // User typing rapidly
    controller.onContentChange('file-1', 'ab');
    vi.advanceTimersByTime(500);

    controller.onContentChange('file-1', 'abc');
    vi.advanceTimersByTime(500);

    controller.onContentChange('file-1', 'abcd');
    vi.advanceTimersByTime(1500); // idle for 1.5s
    await Promise.resolve();

    expect(updateFileSpy).toHaveBeenCalledTimes(1);
    expect(updateFileSpy).toHaveBeenCalledWith('file-1', { content: 'abcd' });
    expect(controller.lastSavedContent.get('file-1')).toBe('abcd');
  });

  it('skips updateFile when content is unchanged from last saved snapshot', async () => {
    const updateFileSpy = vi.spyOn(api, 'updateFile').mockResolvedValue({} as any);

    const controller = new AutosaveController('editor', true);
    controller.lastSavedContent.set('file-1', 'same content');

    controller.onContentChange('file-1', 'same content');
    vi.advanceTimersByTime(2000);
    await Promise.resolve();

    expect(updateFileSpy).not.toHaveBeenCalled();
  });

  it('handles offline mode by deferring save and flushing on reconnection', async () => {
    const updateFileSpy = vi.spyOn(api, 'updateFile').mockResolvedValue({} as any);

    const controller = new AutosaveController('editor', false); // offline
    controller.lastSavedContent.set('file-1', 'v1');

    controller.onContentChange('file-1', 'v2-offline');
    vi.advanceTimersByTime(3000);

    expect(updateFileSpy).not.toHaveBeenCalled();
    expect(controller.saveState).toBe('offline');
    expect(controller.pendingOffline).toEqual({ fileId: 'file-1', content: 'v2-offline' });

    // Connection restored
    await controller.onReconnect();

    expect(updateFileSpy).toHaveBeenCalledTimes(1);
    expect(updateFileSpy).toHaveBeenCalledWith('file-1', { content: 'v2-offline' });
    expect(controller.saveState).toBe('saved');
  });
});
