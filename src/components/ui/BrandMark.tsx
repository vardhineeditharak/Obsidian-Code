import React from 'react';

export interface BrandMarkProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  className?: string;
}

/**
 * Obsidian Code brand mark.
 * Loads the canonical brand asset (public/logo.svg) via an <img> so the in-app
 * logo stays in sync with the shipped brand asset and the browser favicon — a
 * single source of truth. Rendered as an image so it scales crisply at any size
 * with zero inline-vector upkeep. Provide sizing via `className` (e.g. "w-8 h-8").
 */
export const BrandMark: React.FC<BrandMarkProps> = ({ className, ...props }) => {
  return (
    <img
      src="/logo.svg"
      alt="Obsidian Code"
      draggable={false}
      className={className}
      {...props}
    />
  );
};

