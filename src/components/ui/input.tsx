import React from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  icon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, icon, ...props }, ref) => {
    return (
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground/70">
            {icon}
          </div>
        )}
        <input
          type={type}
          className={cn(
            'flex min-h-11 w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-base text-foreground shadow-sm transition-[border-color,box-shadow,background-color] file:border-0 file:bg-transparent file:text-sm file:font-semibold placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 sm:text-sm',
            icon && 'pl-10',
            error && 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/15',
            className
          )}
          ref={ref}
          {...props}
        />
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };
