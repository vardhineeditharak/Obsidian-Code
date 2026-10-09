import React from 'react';
import { MorphIcon } from 'morphicons/react';

// Common stroke centerline SVG paths (24x24 standard grid)
export const ICON_PATHS = {
  // Run / Stop execution
  play: 'M5 3l14 9-14 9V3z',
  stop: 'M6 6h12v12H6z',
  
  // Audio Controls
  volumeHigh: 'M11 5L6 9H2v6h4l5 4V5z M19.07 4.93a10 10 0 010 14.14 M15.54 8.46a5 5 0 010 7.07',
  volumeMute: 'M11 5L6 9H2v6h4l5 4V5z M23 9l-6 6 M17 9l6 6',

  // Network Connectivity
  wifi: 'M5 12.55a11 11 0 0114.08 0 M1.42 9a16 16 0 0121.16 0 M8.53 16.11a6 6 0 016.95 0 M12 20h.01',
  wifiOff: 'M1 1l22 22 M16.72 11.06A10.94 10.94 0 0119.08 12.55 M5 12.55a10.94 10.94 0 015.17-2.39 M10.71 5.05A16 16 0 0122.58 9 M1.42 9a15.91 15.91 0 014.7-2.88 M8.53 16.11a6 6 0 016.95 0 M12 20h.01',

  // Theme Switching
  sun: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z',
  moon: 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',

  // Drawer & Panel Visibility
  terminal: 'M4 17l6-6-6-6 M12 19h8',
  code: 'M16 18l6-6-6-6 M8 6l-6 6 6 6',

  // Search & Clear
  search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  clear: 'M18 6L6 18 M6 6l12 12',

  // Copy & Check
  copy: 'M8 4v12a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2H10a2 2 0 00-2 2z M4 8H2v12a2 2 0 002 2h12v-2',
  check: 'M20 6L9 17l-5-5',

  // Expand / Collapse Chevron
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
};

export type IconPathKey = keyof typeof ICON_PATHS;

export interface AnimatedIconProps {
  fromKey?: IconPathKey;
  toKey?: IconPathKey;
  iconKey?: IconPathKey;
  spring?: 'smooth' | 'snappy' | 'bouncy';
  size?: number | string;
  color?: string;
  strokeWidth?: number;
  className?: string;
  label?: string;
}

/**
 * AnimatedIcon wraps Morphicons with standard Obsidian Code sizing,
 * spring physics, and reduced motion compliance.
 */
export const AnimatedIcon: React.FC<AnimatedIconProps> = ({
  fromKey,
  toKey,
  iconKey,
  spring = 'snappy',
  size = 18,
  color = 'currentColor',
  strokeWidth = 2,
  className = '',
  label,
}) => {
  // If controlled from/to provided:
  if (fromKey && toKey) {
    return (
      <MorphIcon
        from={ICON_PATHS[fromKey]}
        to={ICON_PATHS[toKey]}
        spring={spring}
        size={size}
        color={color}
        strokeWidth={strokeWidth}
        reducedMotion="user"
        className={className}
        label={label}
      />
    );
  }

  // If uncontrolled iconKey provided:
  const path = iconKey ? ICON_PATHS[iconKey] : ICON_PATHS.code;
  return (
    <MorphIcon
      icon={path}
      spring={spring}
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      reducedMotion="user"
      className={className}
      label={label}
    />
  );
};
