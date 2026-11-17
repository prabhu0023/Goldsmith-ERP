import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={cn('rounded-xl border border-line bg-surface', padded && 'p-5', className)}>{children}</div>;
}

/** 12 / 700 / +1.2 tracking, upper case. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn('text-xs font-bold uppercase tracking-[0.1em] text-ink-4', className)}>{children}</h3>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export const inputCls =
  'w-full min-h-11 rounded-lg border border-line-2 bg-surface px-3 text-sm text-ink placeholder:text-ink-4 focus:border-gold disabled:bg-paper disabled:text-ink-3';

export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 block text-sm font-semibold text-ink-2">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-[13px] text-ink-3">{hint}</span>}
      {error && <span className="mt-1 block text-[13px] font-semibold text-stop">{error}</span>}
    </label>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputCls, className)} {...rest} />;
}
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputCls, className)} {...rest}>
      {children}
    </select>
  );
}
export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputCls, 'min-h-24 py-2', className)} {...rest} />;
}

/** A quiet neutral label (source, confidence, group). Never carries a status colour. */
export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-full border border-line-2 bg-paper px-2.5 py-0.5 text-[13px] font-medium text-ink-2', className)}>{children}</span>;
}

/** A line of error or confirmation text under a form. */
export function Notice({ tone, children }: { tone: 'stop' | 'live' | 'wait'; children: ReactNode }) {
  const t = { stop: 'border-stop bg-stop-soft text-stop', live: 'border-live bg-live-soft text-live', wait: 'border-wait bg-wait-soft text-wait' }[tone];
  return (
    <p role={tone === 'stop' ? 'alert' : 'status'} className={cn('rounded-lg border px-3 py-2 text-sm font-semibold', t)}>
      {children}
    </p>
  );
}
