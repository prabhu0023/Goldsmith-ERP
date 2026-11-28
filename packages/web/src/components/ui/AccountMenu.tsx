import { ROLE_INFO } from '@goldsmith/shared';
import { ChevronsUpDown, LogOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../shell/session-context';
import { cn } from './cn';
interface Props {
  /** Which way the menu opens. The rail foot opens upward. */
  placement?: 'up' | 'down';
  className?: string;
  /** Start with the menu open (static renders in tests). */
  defaultOpen?: boolean;
}
const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
/**
 * The account menu (EP-05-S12, EP-08-S14): the signed-in person's name and role label, and a menu
 * holding only "Sign out" (EP-04-S6). If signing out fails the menu stays open with the error so
 * the person can try again (EP-04-S11). It reads the session; there is nothing to switch.
 */
export function AccountMenu({ placement = 'up', className, defaultOpen = false }: Props) {
  const { user, role, signOut } = useSession();
  const [open, setOpen] = useState(defaultOpen);
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
  const roleLabel = ROLE_INFO.find((r) => r.id === role)?.label ?? role;
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
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-closed text-sm font-bold text-white">{initialsOf(user.name)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{user.name}</span>
          <span className="block truncate text-[13px] text-ink-3">{roleLabel}</span>
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
        </div>
      )}
    </div>
  );
}
