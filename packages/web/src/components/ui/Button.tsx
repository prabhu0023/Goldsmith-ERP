import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-gold text-ink hover:brightness-95 border border-gold',
  secondary: 'bg-surface text-ink border border-line-2 hover:bg-paper',
  ghost: 'bg-transparent text-ink-2 border border-transparent hover:bg-closed-soft',
  danger: 'bg-surface text-stop border border-stop hover:bg-stop-soft',
  quiet: 'bg-transparent text-gold-ink border border-transparent hover:underline',
};
const sizes: Record<Size, string> = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-11 px-4 text-sm',
  /** 56 px touch target, for the karigar phone. */
  lg: 'min-h-14 px-5 text-[15px]',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  block?: boolean;
}

export function Button({ variant = 'secondary', size = 'md', icon, block, className, children, type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition disabled:opacity-45',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
