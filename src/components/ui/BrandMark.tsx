import React from 'react';

export interface BrandMarkProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

/**
 * Obsidian Code mark:
 * Pure-vector isometric cube reduced to its essential silhouette.
 * Uses currentColor to adapt to light (#26251e ink) and dark (#f2f1ed parchment) themes
 * without CSS filters or inversion artifacts.
 */
export const BrandMark: React.FC<BrandMarkProps> = ({ className, ...props }) => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      role="img"
      className={className}
      {...props}
    >
      <title>Obsidian Code mark</title>
      {/* Hexagonal silhouette outline */}
      <path
        d="M24 6 L40 15 V33 L24 42 L8 33 V15 Z"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Interior Y-divider meeting at center */}
      <path
        d="M24 24 V6 M24 24 L40 33 M24 24 L8 33"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
