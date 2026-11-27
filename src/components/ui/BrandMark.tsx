import React from 'react';

export interface BrandMarkProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  className?: string;
}

/**
 * App logo rendered from public/logo.svg.
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
