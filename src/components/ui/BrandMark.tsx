import React from 'react';

export interface BrandMarkProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  className?: string;
}

/**
 * Obsidian Code canonical brand emblem backed by public/logo.svg.
 */
export function BrandMark({ className, ...props }: BrandMarkProps) {
  return (
    <img
      src="/logo.svg"
      alt="Obsidian Code"
      draggable={false}
      className={className}
      {...props}
    />
  );
}
