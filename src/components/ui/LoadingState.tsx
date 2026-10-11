import React from 'react';
import { RotateCw } from 'lucide-react';
import { BrandMark } from './BrandMark';

interface LoadingStateProps {
  label?: string;
  fullscreen?: boolean;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  label = 'Loading Obsidian Code…',
  fullscreen = false,
  className = '',
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
        <RotateCw className="w-3.5 h-3.5 animate-spin text-ash" aria-hidden="true" />
        <span className="font-mono text-xs text-driftwood tracking-wide">
          {label}
        </span>
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
