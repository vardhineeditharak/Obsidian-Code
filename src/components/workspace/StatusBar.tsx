import React from 'react';
import { AlertCircle, AlertTriangle, ShieldAlert } from 'lucide-react';
import { TransportMode, ProjectRole } from '../../lib/types';
import { AnimatedIcon } from '../ui/AnimatedIcon';

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
    <footer className="h-6 border-t border-white/10 bg-[#0A0F1D] px-3 flex items-center justify-between text-[11px] text-slate-400 select-none z-20">
      {/* Left Status: Connection, Problems, Transport */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <AnimatedIcon
            iconKey={isOnline ? 'wifi' : 'wifiOff'}
            size={11}
            color={isOnline ? '#38BDF8' : '#FBBF24'}
          />
          <span className={isOnline ? 'text-slate-300' : 'text-amber-400'}>
            {isOnline ? 'Connected' : 'Offline (Local IDB)'}
          </span>
        </div>

        <span className="text-slate-600">|</span>

        <span className="text-slate-300 font-mono">{transportMode}</span>

        <span className="text-slate-600">|</span>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-rose-400">
            <AlertCircle className="w-3 h-3" /> {errorCount}
          </span>
          <span className="flex items-center gap-1 text-amber-400">
            <AlertTriangle className="w-3 h-3" /> {warnCount}
          </span>
        </div>
      </div>

      {/* Right Status: Language, Spaces, Ln/Col, Read-only */}
      <div className="flex items-center gap-4">
        {userRole === 'viewer' && (
          <span className="flex items-center gap-1 text-amber-400 font-medium">
            <ShieldAlert className="w-3 h-3" /> Viewer (Read-only)
          </span>
        )}

        <span>Ln {cursorLine}, Col {cursorColumn}</span>

        <span className="text-slate-600">|</span>

        <span>Spaces: 2</span>

        <span className="text-slate-600">|</span>

        <span>UTF-8</span>

        <span className="text-slate-600">|</span>

        <span className="uppercase text-blue-400 font-semibold">{currentLanguage}</span>
      </div>
    </footer>
  );
};
