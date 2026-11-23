import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const variants = {
  primary:
    'border-emerald-200 bg-emerald-300 text-emerald-950 shadow-[0_2px_12px_#34d39930] hover:bg-emerald-200',
  secondary:
    'border-[#52675d] bg-[#22302a] text-[#edf6ef] hover:border-emerald-300 hover:bg-[#30453b]',
  danger:
    'border-rose-400/45 bg-rose-950 text-rose-100 hover:border-rose-300 hover:bg-rose-900',
  warning: 'border-amber-300 bg-amber-300 text-amber-950 hover:bg-amber-200',
};

type ButtonProps = {
  variant?: keyof typeof variants;
} & (
  | (ComponentProps<'button'> & { href?: never })
  | (ComponentProps<'a'> & { href: string })
);

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonProps) {
  const classes = cn(
    'inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none',
    variants[variant],
    className,
  );

  if (props.href !== undefined) return <a {...props} className={classes} />;

  return <button type="button" {...props} className={classes} />;
}
