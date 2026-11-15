import type { ReactNode } from 'react';
import { isActive } from '../../nav';
import type { NavSection, RouteId } from '../../nav';
import type { BadgeKey } from '../../store/selectors';
import { cn } from './cn';

interface Props {
  sections: NavSection[];
  routeId: RouteId;
  badges: Partial<Record<BadgeKey, number>>;
  onNavigate: (id: RouteId) => void;
  /** The branch line under the brand. */
  branch: string;
  /** RoleChip and the dev toggle. */
  footer?: ReactNode;
  className?: string;
}

/** The left rail. AppShell shows it fixed from lg up and as a drawer below. */
export function Rail({ sections, routeId, badges, onNavigate, branch, footer, className }: Props) {
  return (
    <nav aria-label="Main" className={cn('flex h-full w-64 flex-col border-r border-line bg-surface', className)}>
      <div className="flex items-center gap-3 border-b border-line p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-closed font-serif text-xl font-bold text-gold">JGD</span>
        <div className="min-w-0">
          <p className="truncate font-serif text-lg font-semibold leading-tight text-ink">Jai Gulab Dev</p>
          <p className="truncate text-[13px] text-ink-3">{branch}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section) => (
          <div key={section.label} className="mb-5">
            <p className="px-3 pb-1.5 text-xs font-bold uppercase tracking-[0.1em] text-ink-4">{section.label}</p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item, routeId);
                const badge = item.badge ? badges[item.badge] : undefined;
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-current={active ? 'page' : undefined}
                      onClick={() => onNavigate(item.id)}
                      className={cn(
                        'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold transition',
                        active ? 'bg-gold-soft text-gold-ink' : 'text-ink-2 hover:bg-paper',
                      )}
                    >
                      <Icon size={18} className={active ? 'text-gold' : 'text-ink-4'} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {badge !== undefined && badge > 0 && (
                        <span className={cn('rounded-full px-2 py-0.5 text-[13px] font-bold', item.badge === 'decisions' ? 'bg-stop text-white' : 'bg-closed-soft text-ink-2')}>{badge}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {footer && <div className="space-y-3 border-t border-line p-3">{footer}</div>}
    </nav>
  );
}
