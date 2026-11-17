import { ChevronDown, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from './cn';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  /** The one figure the drawer is about. */
  hero?: { label: string; value: ReactNode; note?: ReactNode };
  children?: ReactNode;
  /** Sticky at the foot. */
  actions?: ReactNode;
}

/** Right-hand drawer: hero figure on top, collapsible detail below, actions pinned to the foot. */
export function DetailDrawer({ open, onClose, title, subtitle, hero, children, actions }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-ink/35" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label={title} className="relative flex h-full w-full max-w-[28rem] flex-col bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-ink-3">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close drawer" className="rounded-lg p-2 text-ink-3 hover:bg-closed-soft">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {hero && (
            <div className="mb-5 rounded-xl bg-gold-soft p-4">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-gold-ink">{hero.label}</p>
              <div className="mt-1">{hero.value}</div>
              {hero.note && <p className="mt-1 text-sm text-ink-2">{hero.note}</p>}
            </div>
          )}
          {children}
        </div>
        {actions && <div className="flex flex-wrap gap-2 border-t border-line bg-surface p-4">{actions}</div>}
      </aside>
    </div>
  );
}

export function DrawerSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-line py-3">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left text-[15px] font-semibold text-ink">
        {title}
        <ChevronDown size={18} className={cn('text-ink-3 transition', open && 'rotate-180')} />
      </button>
      {open && <div className="mt-3 text-sm text-ink-2">{children}</div>}
    </section>
  );
}
