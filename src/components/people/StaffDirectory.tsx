import { Plus } from 'lucide-react';
import { useStore } from '../../store/StoreProvider';
import { Button, Card, PageHeader, Pill, StatusChip } from '../ui';
import { initialsOf } from '../../store/selectors';
import { plural } from '../home/util';

/** Owner only. Every staff member, their role and how many sales are counted to them. */
export function StaffDirectory() {
  const { state, go, role } = useStore();
  if (role !== 'owner') {
    return (
      <div>
        <PageHeader title="Staff" />
        <Card>
          <p className="text-[15px] text-ink-2">Only the owner sees the staff list.</p>
        </Card>
      </div>
    );
  }
  return (
    <div>
      <PageHeader
        title="Staff"
        subtitle="Their role decides what they land on and what they may do. Every sale they make is counted to them."
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => go('staff-new')}>
            Add a staff member
          </Button>
        }
      />
      <ul className="space-y-3">
        {state.staff.map((m) => (
          <li key={m.id}>
            <Card className="flex flex-wrap items-center gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-closed text-sm font-bold text-white" aria-hidden>
                {initialsOf(m.name)}
              </span>
              <div className="min-w-[12rem] flex-1">
                <p className="text-[15px] font-semibold text-ink">{m.name}</p>
                <p className="text-sm text-ink-3">
                  {m.phone} · signs in as <span className="font-mono">{m.login}</span>
                </p>
              </div>
              <StatusChip tone={m.role === 'owner' ? 'closed' : 'live'} label={m.role === 'owner' ? 'Owner' : 'Staff'} />
              <Pill>{m.role === 'owner' ? 'lands on Decisions' : 'lands on Today'}</Pill>
              <span className="w-28 text-right text-sm text-ink-3">{m.role === 'owner' ? 'No sales counted' : plural(m.salesCount, 'sale')}</span>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
