import React from 'react';
import { AlertCircle, AlertTriangle, ShieldAlert, RotateCw, Check } from 'lucide-react';
import { TransportMode, ProjectRole, SaveState } from '../../lib/types';
import { Wifi, WifiOff } from '../ui/AnimatedIcon';

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

  return (
    <footer className="h-6 border-t border-stone bg-linen dark:bg-bone px-3 flex items-center justify-between text-[11px] font-sans font-medium text-ash select-none z-20 transition-colors duration-200">
      {/* Left Status: Connection, Save State, Problems, Transport */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1.5">
          {isOnline ? (
            <Wifi size={11} color="currentColor" className="text-verdant" />
          ) : (
            <WifiOff size={11} color="currentColor" className="text-amber" />
          )}
          <span className={isOnline ? 'text-verdant font-medium' : 'text-amber font-medium'}>
            {isOnline ? 'Connected' : 'Offline'}
          </span>
        </div>

        <span className="text-stone">|</span>

        {/* Save State Indicator */}
        <div className="flex items-center gap-1.5 font-mono text-[10px]">
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
              <span className="w-1.5 h-1.5 rounded-full bg-amber" />
              <span className="text-amber">Saved locally · will sync</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-verdant" />
              <span className="text-verdant">Up to date</span>
            </>
          )}
        </div>

        <span className="text-stone">|</span>

        <span className="font-mono text-[11px] text-ash uppercase">{transportMode}</span>

        <span className="text-stone">|</span>

        <div className="flex items-center gap-2 font-mono">
          <span className="flex items-center gap-1 text-crimson">
            <AlertCircle className="w-3 h-3" /> {errorCount}
          </span>
          <span className="flex items-center gap-1 text-amber">
            <AlertTriangle className="w-3 h-3" /> {warnCount}
          </span>
        </div>
      </div>

      {/* Right Status: Language, Spaces, Ln/Col, Read-only */}
      <div className="flex items-center gap-2.5 font-mono text-[11px]">
        {userRole === 'viewer' && (
          <span className="flex items-center gap-1 text-amber font-sans font-medium">
            <ShieldAlert className="w-3 h-3" /> Read-only
          </span>
        )}

        <span>Ln {cursorLine}, Col {cursorColumn}</span>

        <span className="text-stone">|</span>

        <span>Spaces: 2</span>

        <span className="text-stone">|</span>

        <span>UTF-8</span>

        <span className="text-stone">|</span>

        <span className="uppercase text-ink font-medium">{currentLanguage}</span>
      </div>
    </footer>
  );
};
