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
    <footer className="h-6 border-t border-black/[0.06] dark:border-white/[0.08] bg-slate-100/90 dark:bg-[#0A0F1D]/90 backdrop-blur-md px-3 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 select-none z-20 transition-colors duration-200">
      {/* Left Status: Connection, Problems, Transport */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          {isOnline ? (
            <Wifi size={11} color="#0284C7" />
          ) : (
            <WifiOff size={11} color="#D97706" />
          )}
          <span className={isOnline ? 'text-slate-600 dark:text-slate-300 font-medium' : 'text-amber-500 dark:text-amber-400 font-medium'}>
            {isOnline ? 'Connected' : 'Offline (Local IDB)'}
          </span>
        </div>

        <span className="text-slate-300 dark:text-slate-700">|</span>

        <span className="text-slate-600 dark:text-slate-300 font-mono text-[10px]">{transportMode}</span>

        <span className="text-slate-300 dark:text-slate-700">|</span>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-rose-500 dark:text-rose-400">
            <AlertCircle className="w-3 h-3" /> {errorCount}
          </span>
          <span className="flex items-center gap-1 text-amber-500 dark:text-amber-400">
            <AlertTriangle className="w-3 h-3" /> {warnCount}
          </span>
        </div>
      </div>

      {/* Right Status: Language, Spaces, Ln/Col, Read-only */}
      <div className="flex items-center gap-3">
        {userRole === 'viewer' && (
          <span className="flex items-center gap-1 text-amber-500 dark:text-amber-400 font-medium">
            <ShieldAlert className="w-3 h-3" /> Viewer (Read-only)
          </span>
        )}

        <span>Ln {cursorLine}, Col {cursorColumn}</span>

        <span className="text-slate-300 dark:text-slate-700">|</span>

        <span>Spaces: 2</span>

        <span className="text-slate-300 dark:text-slate-700">|</span>

        <span>UTF-8</span>

        <span className="text-slate-300 dark:text-slate-700">|</span>

        <span className="uppercase text-blue-600 dark:text-blue-400 font-semibold">{currentLanguage}</span>
      </div>
    </footer>
  );
};
