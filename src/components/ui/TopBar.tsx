import { Menu } from 'lucide-react';

interface Props {
  title: string;
  onMenu: () => void;
}

/** Shown below lg only: hamburger opens the rail as a drawer. */
export function TopBar({ title, onMenu }: Props) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface px-4 py-2 lg:hidden">
      <button type="button" onClick={onMenu} aria-label="Open menu" className="flex h-11 w-11 items-center justify-center rounded-lg border border-line-2 text-ink-2">
        <Menu size={20} />
      </button>
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-closed font-serif text-sm font-bold text-gold">JGD</span>
      <span className="truncate text-[15px] font-semibold text-ink">{title}</span>
    </header>
  );
}
