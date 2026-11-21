import { Check, ChevronsUpDown, LogOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/StoreProvider';
import { cn } from './cn';

interface Props {
  /** Which way the menu opens. The rail foot opens upward. */
  placement?: 'up' | 'down';
  className?: string;
}

/**
 * Avatar chip showing who is signed in. With a real session its menu holds only "Sign out" (EP-04-S6);
 * if signing out fails the menu stays open with the error so the person can try again (S11).
 * Without a session it switches between the staff, owner and karigar identities.
 */
export function RoleChip({ placement = 'up', className }: Props) {
  const { identity, identities, switchIdentity, signOut } = useStore();
  const [open, setOpen] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const groups = [
    { label: 'Showroom', people: identities.filter((i) => i.role !== 'karigar') },
    { label: 'Karigars', people: identities.filter((i) => i.role === 'karigar') },
  ];

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setSignOutError(null);
          setOpen(!open);
        }}
        className="flex w-full min-h-14 items-center gap-3 rounded-xl border border-line bg-surface p-2.5 text-left hover:bg-paper"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-closed text-sm font-bold text-white">{identity.initials}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{identity.name}</span>
          <span className="block truncate text-[13px] text-ink-3">{signOut ? identity.subtitle : `${identity.subtitle} · switch`}</span>
        </span>
        <ChevronsUpDown size={16} className="shrink-0 text-ink-4" />
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute left-0 z-50 w-72 max-w-[85vw] rounded-xl border border-line bg-surface p-2 shadow-xl',
            placement === 'up' ? 'bottom-full mb-2' : 'top-full mt-2',
          )}
        >
          {signOut ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setSignOutError(null);
                  void signOut().then(setSignOutError);
                }}
                className="flex min-h-14 w-full items-center gap-3 rounded-lg px-2 text-left text-sm font-semibold text-ink hover:bg-paper"
              >
                <LogOut size={16} className="shrink-0 text-ink-3" />
                Sign out
              </button>
              {signOutError && (
                <p role="alert" className="px-2 py-1 text-sm font-semibold text-stop">
                  {signOutError}
                </p>
              )}
            </>
          ) : (
            groups.map((g) => (
              <div key={g.label} className="py-1">
                <p className="px-2 py-1 text-xs font-bold uppercase tracking-[0.1em] text-ink-4">{g.label}</p>
                {g.people.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={p.id === identity.id}
                    onClick={() => {
                      switchIdentity(p.id);
                      setOpen(false);
                    }}
                    className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-paper"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-closed-soft text-xs font-bold text-ink-2">{p.initials}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                      <span className="block truncate text-[13px] text-ink-3">{p.subtitle}</span>
                    </span>
                    {p.id === identity.id && <Check size={16} className="text-live" />}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
