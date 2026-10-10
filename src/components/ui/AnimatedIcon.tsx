import React from 'react';
import { MorphIcon } from 'morphicons/react';
import { useTheme } from '../../lib/theme';

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

  // Expand / Collapse Chevrons
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
  chevronUp: 'M18 15l-6-6-6 6',
  chevronLeft: 'M15 18l-6-6 6-6',

  // File and Folder Management
  file: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6',
  fileCode: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M10 13l-2 2 2 2 M14 13l2 2-2 2',
  filePlus: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M12 18v-6 M9 15h6',
  folder: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
  folderOpen: 'M3 9a2 2 0 012-2h4l2 2h8a2 2 0 012 2v1H3V9zm0 5h18l-2 7H5l-2-7z',
  folderPlus: 'M12 10v6 M9 13h6 M20 20a2 2 0 002-2V8a2 2 0 00-2-2h-7.93a2 2 0 01-1.66-.9l-.82-1.2A2 2 0 007.93 3H4a2 2 0 00-2 2v13a2 2 0 002 2z',
  trash: 'M3 6h18 M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2',
  edit: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  plus: 'M12 5v14 M5 12h14',

  // Actions
  download: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  history: 'M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8 M3 3v5h5 M12 7v5l4 2',
  share: 'M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8 M16 6l-4-4-4 4 M12 2v13',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9',
  users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75',
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

// Named morphicon convenience components
export type IconComponentProps = Omit<AnimatedIconProps, 'iconKey' | 'fromKey' | 'toKey'>;

export const Sun: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="sun" {...props} />;
export const Moon: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="moon" {...props} />;
export const Play: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="play" {...props} />;
export const Stop: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="stop" {...props} />;
export const Search: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="search" {...props} />;
export const History: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="history" {...props} />;
export const Download: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="download" {...props} />;
export const Share: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="share" {...props} />;
export const FilePlus: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="filePlus" {...props} />;
export const FolderPlus: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="folderPlus" {...props} />;
export const Folder: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="folder" {...props} />;
export const FolderOpen: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="folderOpen" {...props} />;
export const FileCode: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="fileCode" {...props} />;
export const File: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="file" {...props} />;
export const Trash: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="trash" {...props} />;
export const Edit: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="edit" {...props} />;
export const ChevronDown: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="chevronDown" {...props} />;
export const ChevronRight: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="chevronRight" {...props} />;
export const ChevronUp: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="chevronUp" {...props} />;
export const Terminal: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="terminal" {...props} />;
export const Code: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="code" {...props} />;
export const Check: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="check" {...props} />;
export const Plus: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="plus" {...props} />;
export const LogOut: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="logout" {...props} />;
export const Users: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="users" {...props} />;
export const Wifi: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="wifi" {...props} />;
export const WifiOff: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="wifiOff" {...props} />;
export const VolumeHigh: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="volumeHigh" {...props} />;
export const VolumeMute: React.FC<IconComponentProps> = (props) => <AnimatedIcon iconKey="volumeMute" {...props} />;

/**
 * Apple-style Light/Dark mode toggle button with smooth spring morphing between Sun and Moon.
 */
export const ThemeToggle: React.FC<{
  className?: string;
  size?: number;
}> = ({ className = '', size = 16 }) => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      type="button"
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      className={`p-1.5 rounded-full text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-black/5 dark:hover:bg-white/8 active:scale-90 transition-all flex items-center justify-center cursor-pointer ${className}`}
    >
      <MorphIcon
        icon={isDark ? ICON_PATHS.sun : ICON_PATHS.moon}
        spring="bouncy"
        size={size}
        color="currentColor"
        strokeWidth={2}
        reducedMotion="user"
      />
    </button>
  );
};
