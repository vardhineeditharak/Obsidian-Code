import React from 'react';

interface SkeletonProps {
  className?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

const radiusClasses = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  full: 'rounded-full',
};

export const Skeleton: React.FC<SkeletonProps> = ({
  className = 'h-4 w-full',
  rounded = 'md',
}) => {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-linen/80 dark:bg-stone/50 ${radiusClasses[rounded]} ${className}`}
    />
  );
};

export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div
      aria-hidden="true"
      className={`bg-bone p-5 rounded-lg border border-(--border-subtle) flex flex-col justify-between h-44 animate-pulse ${className}`}
    >
      <div>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <Skeleton className="w-8 h-8 rounded-md" />
            <div className="space-y-1.5">
              <Skeleton className="w-28 h-4" />
              <Skeleton className="w-16 h-3" />
            </div>
          </div>
        </div>
        <div className="space-y-2 mt-4">
          <Skeleton className="w-full h-3" />
          <Skeleton className="w-3/4 h-3" />
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-(--border-subtle)">
        <Skeleton className="w-24 h-3" />
        <Skeleton className="w-12 h-3" />
      </div>
    </div>
  );
};

export const SkeletonGrid: React.FC<{ count?: number; className?: string }> = ({
  count = 6,
  className = '',
}) => {
  return (
    <div
      role="status"
      aria-label="Loading workspace projects"
      className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`}
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
};
