import React from 'react';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
  icon?: React.ReactNode;
  variant?: 'ghost' | 'secondary' | 'primary' | 'danger';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  ref?: React.Ref<HTMLButtonElement>;
}

const variantClasses: Record<NonNullable<IconButtonProps['variant']>, string> = {
  ghost: 'text-ash hover:text-ink hover:bg-linen active:bg-stone/50 bg-transparent',
  secondary:
    'text-ink bg-linen hover:bg-stone/60 active:bg-stone border border-(--border-subtle)',
  primary: 'text-parchment bg-ink hover:opacity-90 active:opacity-80',
  danger: 'text-ash hover:text-crimson hover:bg-crimson/10 active:bg-crimson/20',
};

const sizeClasses: Record<NonNullable<IconButtonProps['size']>, string> = {
  xs: 'p-0.5 text-xs rounded-sm',
  sm: 'p-1 text-xs rounded-md',
  md: 'p-1.5 text-sm rounded-md',
  lg: 'p-2 text-base rounded-md',
};

export function IconButton({
  'aria-label': ariaLabel,
  icon,
  children,
  variant = 'ghost',
  size = 'sm',
  title,
  className = '',
  type = 'button',
  disabled = false,
  ref,
  ...props
}: IconButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={ariaLabel}
      title={title ?? ariaLabel}
      disabled={disabled}
      className={`inline-flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ink dark:focus-visible:ring-parchment ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {icon ?? children}
    </button>
  );
}
