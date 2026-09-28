import type { HTMLAttributes } from 'react';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export default function Skeleton({ className = "", ...props }: SkeletonProps) {
  return (
    <div
      {...props}
      className={`animate-pulse skeleton-shimmer rounded ${className}`}
    />
  );
}
