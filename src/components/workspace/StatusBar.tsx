import React from 'react';
import { AlertCircle, AlertTriangle, ShieldAlert } from 'lucide-react';
import { TransportMode, ProjectRole } from '../../lib/types';
import { Wifi, WifiOff } from '../ui/AnimatedIcon';

interface StatusBarProps {
  isOnline: boolean;
  transportMode: TransportMode;
  errorCount: number;
  warnCount: number;
  currentLanguage: string;
  cursorLine: number;
  cursorColumn: number;
  userRole: ProjectRole;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  isOnline,
  transportMode,
  errorCount,
  warnCount,
  currentLanguage,
  cursorLine,
  cursorColumn,
  userRole,
}) => {
  return (
    <footer className="h-6 border-t border-stone bg-linen dark:bg-bone px-3 flex items-center justify-between text-[11px] font-sans font-medium text-ash select-none z-20 transition-colors duration-200">
      {/* Left Status: Connection, Problems, Transport */}
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
