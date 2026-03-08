import React from 'react';
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'default' | 'primary' | 'white';
  className?: string;
  text?: string;
}

const sizeMap = {
  sm:  { outer: 'w-5 h-5',  inner: 'inset-[4px]',  dot: 'w-1 h-1',   border: 'border-[2px]' },
  md:  { outer: 'w-9 h-9',  inner: 'inset-[7px]',  dot: 'w-1.5 h-1.5', border: 'border-[2px]' },
  lg:  { outer: 'w-14 h-14', inner: 'inset-[10px]', dot: 'w-2 h-2',   border: 'border-[3px]' },
  xl:  { outer: 'w-20 h-20', inner: 'inset-[14px]', dot: 'w-2.5 h-2.5', border: 'border-[3px]' },
};

const variantMap = {
  default: { ring: 'border-t-violet-500',  inner: 'border-t-indigo-400',  dot: 'bg-violet-400',  text: 'text-white/50' },
  primary: { ring: 'border-t-violet-500',  inner: 'border-t-indigo-400',  dot: 'bg-violet-400',  text: 'text-violet-300' },
  white:   { ring: 'border-t-white',       inner: 'border-t-white/60',    dot: 'bg-white',       text: 'text-white/70' },
};

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  variant = 'default',
  className,
  text,
}) => {
  const s = sizeMap[size];
  const v = variantMap[variant];

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <div className={cn('relative', s.outer)}>
        {/* Track */}
        <div className={cn('absolute inset-0 rounded-full border-violet-500/15', s.border, 'border')} />
        {/* Outer spin */}
        <div className={cn('absolute inset-0 rounded-full border-transparent animate-spin', s.border, 'border', v.ring)} />
        {/* Inner counter-spin */}
        <div
          className={cn('absolute rounded-full border-transparent animate-spin', s.inner, s.border, 'border', v.inner)}
          style={{ animationDirection: 'reverse', animationDuration: '0.65s' }}
        />
        {/* Centre dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={cn('rounded-full animate-pulse', s.dot, v.dot)} />
        </div>
      </div>

      {text && (
        <p className={cn('text-xs font-semibold tracking-wide', v.text)}>{text}</p>
      )}
    </div>
  );
};

export default LoadingSpinner;
