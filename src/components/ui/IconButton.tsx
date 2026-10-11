import React from 'react';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string; // Enforce accessible name for icon-only controls
  icon: React.ReactNode;
  variant?: 'ghost' | 'secondary' | 'primary' | 'danger';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const variantClasses = {
  ghost: 'text-ash hover:text-ink hover:bg-linen active:bg-stone/50 bg-transparent',
  secondary: 'text-ink bg-linen hover:bg-stone/60 active:bg-stone border border-(--border-subtle)',
  primary: 'text-parchment bg-ink hover:opacity-90 active:opacity-80',
  danger: 'text-ash hover:text-crimson hover:bg-crimson/10 active:bg-crimson/20',
};

const sizeClasses = {
  xs: 'p-0.5 text-xs rounded-sm',
  sm: 'p-1 text-xs rounded-md',
  md: 'p-1.5 text-sm rounded-md',
  lg: 'p-2 text-base rounded-md',
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      'aria-label': ariaLabel,
      icon,
      variant = 'ghost',
      size = 'sm',
      title,
      className = '',
      type = 'button',
      disabled = false,
      onClick,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={ariaLabel}
        title={title ?? ariaLabel}
        disabled={disabled}
        onClick={onClick}
        className={`inline-flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ink dark:focus-visible:ring-parchment ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...props}
      >
        {icon}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
