import React from 'react';
import { AlertCircle, AlertTriangle, ShieldAlert, RotateCw, Check } from 'lucide-react';
import { TransportMode, ProjectRole, SaveState } from '../../lib/types';
import { Wifi, WifiOff } from '../ui/AnimatedIcon';
import { editorOptions } from './editorOptions';

interface StatusBarProps {
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
}

function formatSaveRelativeTime(timestamp: number | null | undefined): string {
  if (!timestamp) return 'just now';
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
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
}) => {
  const effectiveSaveState = !isOnline ? 'offline' : saveState;
  const tabSize = editorOptions.tabSize ?? 2;

  return (
    <footer className="h-6.5 border-t border-stone/80 bg-bone/95 backdrop-blur-md px-3 flex items-center justify-between text-[11px] font-mono text-driftwood select-none z-20 overflow-hidden transition-colors duration-200">
      {/* Left Status: Connection, Save State, Problems, Transport */}
      <div className="flex items-center gap-2.5 min-w-0 truncate">
        <div className="flex items-center gap-1.5 shrink-0">
          {isOnline ? (
            <span className="w-1.5 h-1.5 rounded-full bg-verdant shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-warning-yellow" />
          )}
          <span className={isOnline ? 'text-verdant font-medium' : 'text-warning-yellow font-medium'}>
            {isOnline ? 'Connected' : 'Offline'}
          </span>
        </div>

        <span className="w-px h-3 bg-stone/80 shrink-0" aria-hidden="true" />

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

        <span className="w-px h-3 bg-stone/80 shrink-0 hidden sm:inline" aria-hidden="true" />

        <span className="font-mono text-[10px] text-ash uppercase shrink-0 hidden sm:inline">{transportMode}</span>

        <span className="w-px h-3 bg-stone/80 shrink-0 hidden sm:inline" aria-hidden="true" />

        <div className="flex items-center gap-2 font-mono shrink-0">
          <span className="flex items-center gap-1 text-crimson" title={`${errorCount} Errors`}>
            <AlertCircle className="w-3 h-3" /> {errorCount}
          </span>
          <span className="flex items-center gap-1 text-warning-yellow" title={`${warnCount} Warnings`}>
            <AlertTriangle className="w-3 h-3" /> {warnCount}
          </span>
        </div>
      </div>

      {/* Right Status: Language, Spaces, Ln/Col, Read-only */}
      <div className="flex items-center gap-2.5 font-mono text-[11px] shrink-0">
        {userRole === 'viewer' && (
          <span className="flex items-center gap-1 text-warning-yellow font-sans font-medium">
            <ShieldAlert className="w-3 h-3" /> Read-only
          </span>
        )}

        <span>Ln {cursorLine}, Col {cursorColumn}</span>

        <span className="w-px h-3 bg-stone/80 shrink-0 hidden sm:inline" aria-hidden="true" />

        <span className="hidden sm:inline">Spaces: {tabSize}</span>

        <span className="w-px h-3 bg-stone/80 shrink-0 hidden sm:inline" aria-hidden="true" />

        <span className="hidden sm:inline">UTF-8</span>

        <span className="w-px h-3 bg-stone/80 shrink-0" aria-hidden="true" />

        <span className="uppercase text-ink font-medium tracking-wide px-1.5 py-0.5 rounded bg-surface border border-stone/60 text-[10px] shadow-2xs">
          {currentLanguage || 'plaintext'}
        </span>
      </div>
    </footer>
  );
};
