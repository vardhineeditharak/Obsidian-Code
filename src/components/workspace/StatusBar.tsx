import React, { useState, useEffect } from 'react';
import { AlertCircle, AlertTriangle, ShieldAlert, RotateCw, Check } from 'lucide-react';
import { TransportMode, ProjectRole, SaveState } from '../../lib/types';
import { Wifi, WifiOff } from '../ui/AnimatedIcon';
import { editorOptions } from './editorOptions';

export interface StatusBarProps {
  isOnline: boolean;
  saveState?: SaveState;
  lastSavedAt?: number | null;
  transportMode: TransportMode;
  errorCount: number;
  warnCount: number;
  currentLanguage: string;
  cursorLine: number;
  cursorColumn: number;
  userRole: ProjectRole;
  onOpenProblems?: () => void;
}

/**
 * Formats a timestamp into a compact relative label for save-state indicators.
 */
export function formatSaveRelativeTime(timestamp: number | null | undefined): string {
  if (!timestamp) return 'just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  isOnline,
  saveState = 'idle',
  lastSavedAt = null,
  transportMode,
  errorCount,
  warnCount,
  currentLanguage,
  cursorLine,
  cursorColumn,
  userRole,
  onOpenProblems,
}) => {
  const [, setTimeTick] = useState(0);

  useEffect(() => {
    if (!lastSavedAt) return;
    const timer = setInterval(() => setTimeTick((t) => t + 1), 15000);
    return () => clearInterval(timer);
  }, [lastSavedAt]);

  const effectiveSaveState: SaveState = !isOnline ? 'offline' : saveState;
  const tabSize = editorOptions.tabSize ?? 2;

  return (
    <footer className="h-6 border-t border-stone bg-parchment px-3 flex items-center justify-between text-[11px] font-sans font-medium text-ash select-none z-20 overflow-hidden transition-colors duration-200">
      {/* Left Status: Connection, Save State, Transport, Problems */}
      <div className="flex items-center gap-2.5 min-w-0 truncate">
        <div className="flex items-center gap-1.5 shrink-0">
          {isOnline ? (
            <Wifi size={11} color="currentColor" className="text-verdant" />
          ) : (
            <WifiOff size={11} color="currentColor" className="text-warning-yellow" />
          )}
          <span className={isOnline ? 'text-verdant font-medium' : 'text-warning-yellow font-medium'}>
            {isOnline ? 'Connected' : 'Offline'}
          </span>
        </div>

        <span className="text-stone shrink-0" aria-hidden="true">|</span>

        {/* Save State Indicator */}
        <div className="flex items-center gap-1.5 font-mono text-[10px] shrink-0">
          {effectiveSaveState === 'saving' ? (
            <>
              <RotateCw className="w-2.5 h-2.5 animate-spin text-ash" />
              <span>Saving…</span>
            </>
          ) : effectiveSaveState === 'saved' ? (
            <>
              <Check className="w-2.5 h-2.5 text-verdant" />
              <span className="text-verdant">
                All changes saved · {formatSaveRelativeTime(lastSavedAt)}
              </span>
            </>
          ) : effectiveSaveState === 'offline' ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-warning-yellow" />
              <span className="text-warning-yellow">Saved locally · will sync</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-verdant" />
              <span className="text-verdant">Up to date</span>
            </>
          )}
        </div>

        <span className="text-stone shrink-0 hidden sm:inline" aria-hidden="true">|</span>

        <span className="font-mono text-[11px] text-ash uppercase shrink-0 hidden sm:inline">
          {transportMode}
        </span>

        <span className="text-stone shrink-0 hidden sm:inline" aria-hidden="true">|</span>

        <button
          type="button"
          onClick={onOpenProblems}
          title="Open Problems Panel"
          aria-label={`${errorCount} errors, ${warnCount} warnings. Click to open Problems panel`}
          className="flex items-center gap-2 font-mono shrink-0 px-1.5 py-0.5 rounded hover:bg-linen transition cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber"
        >
          <span className="flex items-center gap-1 text-crimson">
            <AlertCircle className="w-3 h-3" /> {errorCount}
          </span>
          <span className="flex items-center gap-1 text-warning-yellow">
            <AlertTriangle className="w-3 h-3" /> {warnCount}
          </span>
        </button>
      </div>

      {/* Right Status: Read-only, Cursor, Spaces, Encoding, Language */}
      <div className="flex items-center gap-2.5 font-mono text-[11px] shrink-0">
        {userRole === 'viewer' && (
          <span className="flex items-center gap-1 text-warning-yellow font-sans font-medium">
            <ShieldAlert className="w-3 h-3" /> Read-only
          </span>
        )}

        <span>Ln {cursorLine}, Col {cursorColumn}</span>

        <span className="text-stone hidden sm:inline" aria-hidden="true">|</span>

        <span className="hidden sm:inline">Spaces: {tabSize}</span>

        <span className="text-stone hidden sm:inline" aria-hidden="true">|</span>

        <span className="hidden sm:inline">UTF-8</span>

        <span className="text-stone" aria-hidden="true">|</span>

        <span className="uppercase text-ink font-medium">{currentLanguage || 'plaintext'}</span>
      </div>
    </footer>
  );
};
