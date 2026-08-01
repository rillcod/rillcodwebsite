import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';

const buttonVariants = cva(
  'inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border text-sm font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] sm:min-h-10',
  {
    variants: {
      variant: {
        default: 'border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md',
        destructive: 'border-destructive bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline: 'border-border bg-card text-foreground shadow-sm hover:border-primary/40 hover:bg-muted',
        secondary: 'border-border bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'border-transparent bg-transparent text-foreground hover:bg-muted',
        link: 'min-h-0 border-transparent bg-transparent p-0 text-primary underline-offset-4 hover:underline active:scale-100'
      },
      size: {
        default: 'h-11 px-4 py-2 sm:h-10',
        sm: 'h-10 px-3 text-xs sm:h-9',
        lg: 'h-12 px-6 text-base',
        icon: 'h-11 w-11 p-0 sm:h-10 sm:w-10'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </Comp>
    );
  }
);

Button.displayName = 'Button';

export { Button, buttonVariants };
