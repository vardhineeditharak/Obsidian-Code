import React from 'react';
import { RotateCw } from 'lucide-react';
import { BrandMark } from './BrandMark';
import { LatticeLoader, type LatticePatternName } from './LatticeLoader';

export interface LoadingStateProps {
  label?: string;
  fullscreen?: boolean;
  className?: string;
  variant?: 'spinner' | 'lattice';
  pattern?: LatticePatternName | string;
  showTimer?: boolean;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  label = 'Loading Obsidian Code…',
  fullscreen = false,
  className = '',
  variant = 'spinner',
  pattern = 'orbit',
  showTimer = false,
}) => {
  const content = (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-3 select-none text-ink ${className}`}
    >
      <div className="relative flex items-center justify-center">
        <BrandMark className="w-9 h-9 text-ink" />
      </div>

      <div className="flex items-center gap-2 mt-1">
        {variant === 'lattice' ? (
          <LatticeLoader
            label={label}
            pattern={pattern}
            grid={3}
            shape="round"
            color="var(--color-amber, #d97736)"
            doneColor="#4ade80"
            errorColor="#f87171"
            showTimer={showTimer}
            fontSize={12}
            cellSize={5}
            gap={2}
          />
        ) : (
          <>
            <RotateCw className="w-3.5 h-3.5 animate-spin text-ash" aria-hidden="true" />
            <span className="font-mono text-xs text-driftwood tracking-wide">
              {label}
            </span>
          </>
        )}
      </div>
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-parchment transition-colors duration-150">
        {content}
      </div>
    );
  }

  return content;
};

