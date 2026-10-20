import React, { useState, useEffect } from 'react';
import { ArrowUpCircle, RotateCw, X, Sparkles } from 'lucide-react';

interface UpdateState {
  type: 'available' | 'downloading' | 'downloaded' | null;
  version?: string;
  percent?: number;
}

export const UpdateAlertBanner: React.FC = () => {
  const [updateState, setUpdateState] = useState<UpdateState>({ type: null });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).obsidianDesktop?.onUpdateStatus) {
      return;
    }

    const unsubscribe = (window as any).obsidianDesktop.onUpdateStatus((status: any) => {
      if (status.type === 'update-available') {
        setUpdateState({ type: 'available', version: status.version });
        setDismissed(false);
      } else if (status.type === 'download-progress' || status.type === 'download-starting') {
        setUpdateState({
          type: 'downloading',
          version: status.version,
          percent: status.percent ?? 0,
        });
      } else if (status.type === 'update-downloaded') {
        setUpdateState({ type: 'downloaded', version: status.version });
        setDismissed(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  if (!updateState.type || dismissed) {
    return null;
  }

  const handleRestart = () => {
    if ((window as any).obsidianDesktop?.restartAndInstallUpdate) {
      (window as any).obsidianDesktop.restartAndInstallUpdate();
    }
  };

  const handleManualCheck = () => {
    if ((window as any).obsidianDesktop?.checkForUpdates) {
      (window as any).obsidianDesktop.checkForUpdates();
    }
  };

  return (
    <aside
      aria-label="Application Update Notice"
      className="w-full bg-[#1e1c17] border-b border-[#2e2a22] text-[#f4efe6] px-4 py-2 flex items-center justify-between text-xs select-none shadow-md z-50 transition-all animate-in fade-in slide-in-from-top-1"
    >
      <div className="flex items-center gap-2.5">
        {updateState.type === 'downloading' ? (
          <RotateCw className="w-4 h-4 text-[#d97736] animate-spin" />
        ) : updateState.type === 'downloaded' ? (
          <Sparkles className="w-4 h-4 text-[#10b981]" />
        ) : (
          <ArrowUpCircle className="w-4 h-4 text-[#d97736]" />
        )}

        <div className="flex items-center gap-2">
          <span className="font-medium text-[#f4efe6]">
            {updateState.type === 'downloaded'
              ? `Obsidian Code v${updateState.version || ''} is ready to install.`
              : updateState.type === 'downloading'
              ? `Downloading update v${updateState.version || ''} (${updateState.percent || 0}%)…`
              : `A new version of Obsidian Code (v${updateState.version || ''}) is available.`}
          </span>
          <span className="hidden sm:inline text-[#c8beaa]">
            {updateState.type === 'downloaded'
              ? 'Restart now to apply the latest features and security improvements.'
              : 'Keep your collaborative environment up to date.'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {updateState.type === 'downloaded' ? (
          <button
            type="button"
            onClick={handleRestart}
            className="px-2.5 py-1 bg-[#d97736] hover:bg-[#c26425] text-white font-medium rounded text-xs transition cursor-pointer shadow-sm"
          >
            Restart & Update
          </button>
        ) : updateState.type === 'available' ? (
          <button
            type="button"
            onClick={handleManualCheck}
            className="px-2.5 py-1 bg-[#2e2a22] hover:bg-[#3d382e] text-[#f4efe6] font-medium rounded text-xs border border-[#443e32] transition cursor-pointer"
          >
            Update Details
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-1 text-[#8c8273] hover:text-[#f4efe6] rounded transition cursor-pointer"
          aria-label="Dismiss update notification"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
};
