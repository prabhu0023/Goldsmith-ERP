import { ROLE_INFO } from '@goldsmith/shared';
import type { RoleId } from '@goldsmith/shared';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { opsCall } from '../../api/ops-client';
import type { OpsAnswer } from '../../api/ops-client';
import { useStore } from '../../store/StoreProvider';
import { initialsOf } from '../../store/selectors';
import { Button, Card, DetailDrawer, Field, Input, Notice, PageHeader, Select, StatusChip } from '../ui';
import type { Tone } from '../ui';
import { rowActions, statusLabel } from './user-rows';
import type { RowAction, UserRow } from './user-rows';
const roleLabel = (role: RoleId): string => ROLE_INFO.find((r) => r.id === role)?.label ?? role;
const ACTION_LABEL: Record<RowAction, string> = {
  resend: 'Resend activation link',
  deactivate: 'Deactivate',
  reactivate: 'Reactivate',
  unlock: 'Unlock',
};
const statusTone = (u: UserRow): Tone =>
  u.status === 'deactivated' ? 'closed' : u.lockedUntilLocal ? 'stop' : u.status === 'pending_activation' ? 'wait' : 'live';
function runAction(action: RowAction, u: UserRow): Promise<OpsAnswer<'resendActivation'>> {
  switch (action) {
    case 'resend':
      return opsCall('resendActivation', { userId: u.id });
    case 'deactivate':
      return opsCall('deactivateUser', { userId: u.id, version: u.version });
    case 'reactivate':
      return opsCall('reactivateUser', { userId: u.id, version: u.version });
    case 'unlock':
      return opsCall('unlockUser', { userId: u.id });
  }
}
/** Owner only (EP-05-S11). Every user of the shop from the server, their role, status and actions. */
export function StaffDirectory() {
  const { can } = useStore();
  if (!can('listUsers')) {
    return (
      <div>
        <PageHeader title="Staff" />
        <Card>
          <p className="text-[15px] text-ink-2">Only the owner sees the staff list.</p>
        </Card>
      </div>
    );
  }
  return <UserDirectory />;
}
function UserDirectory() {
  const { go } = useStore();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const load = useCallback(async (cursor?: string) => {
    setLoading(true);
    setLoadError(null);
    const answer = await opsCall('listUsers', cursor ? { cursor } : {});
    setLoading(false);
    if (!answer.ok) return setLoadError(answer.message);
    setUsers((prev) => (cursor ? [...prev, ...answer.data.items] : answer.data.items));
    setNextCursor(answer.data.nextCursor);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const act = async (action: RowAction, u: UserRow) => {
    setBusy(true);
    setActionError(null);
    const answer = await runAction(action, u);
    setBusy(false);
    if (!answer.ok) return setActionError(answer.message);
    await load();
  };
  const open = users.find((u) => u.id === openId) ?? null;
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
      {actionError && (
        <div className="mb-4">
          <Notice tone="stop">{actionError}</Notice>
        </div>
      )}
      {loadError && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Notice tone="stop">{loadError}</Notice>
          <Button onClick={() => void load()}>Retry</Button>
        </div>
      )}
      <ul className="space-y-3">
        {users.map((u) => (
          <li key={u.id}>
            <Card className="flex flex-wrap items-center gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-closed text-sm font-bold text-white" aria-hidden>
                {initialsOf(u.name)}
              </span>
              <div className="min-w-[12rem] flex-1">
                <p className="text-[15px] font-semibold text-ink">{u.name}</p>
                <p className="text-sm text-ink-3">
                  {u.phone} · {u.email}
                  {u.karigarId ? ` · ${u.karigarId}` : ''}
                </p>
              </div>
              <StatusChip tone={u.role === 'owner' ? 'closed' : 'live'} label={roleLabel(u.role)} />
              <StatusChip tone={statusTone(u)} label={statusLabel(u)} />
              <div className="flex flex-wrap gap-2">
                {rowActions(u).map((a) => (
                  <Button key={a} size="sm" variant={a === 'deactivate' ? 'danger' : 'secondary'} disabled={busy} onClick={() => void act(a, u)}>
                    {ACTION_LABEL[a]}
                  </Button>
                ))}
                <Button size="sm" variant="ghost" onClick={() => setOpenId(u.id)}>
                  Open
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {loading && <p className="mt-3 text-sm text-ink-3">Loading the staff list…</p>}
      {!loading && nextCursor && (
        <div className="mt-4">
          <Button onClick={() => void load(nextCursor)}>Load more</Button>
        </div>
      )}
      {open && (
        <UserDrawer
          key={`${open.id}:${open.version}`}
          user={open}
          onClose={() => setOpenId(null)}
          onSaved={async () => {
            setOpenId(null);
            await load();
          }}
        />
      )}
    </div>
  );
}
/** Edit one user: name, phone, email (S5), role (S6) and the karigar link (S13). */
function UserDrawer({ user, onClose, onSaved }: { user: UserRow; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<RoleId>(user.role);
  const [roleKarigar, setRoleKarigar] = useState('');
  const [linkCode, setLinkCode] = useState(user.karigarId ?? '');
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (call: () => Promise<OpsAnswer<'updateUserProfile'>>) => {
    setBusy(true);
    setError(null);
    const answer = await call();
    setBusy(false);
    if (!answer.ok) return setError({ message: answer.message, field: answer.field });
    await onSaved();
  };
  const saveProfile = (e: FormEvent) => {
    e.preventDefault();
    void run(() => opsCall('updateUserProfile', { userId: user.id, version: user.version, name, phone, email }));
  };
  const saveRole = (e: FormEvent) => {
    e.preventDefault();
    const karigarId = role === 'karigar' && roleKarigar.trim() ? { karigarId: roleKarigar.trim() } : {};
    void run(() => opsCall('updateUserRole', { userId: user.id, version: user.version, role, ...karigarId }));
  };
  const saveLink = (e: FormEvent) => {
    e.preventDefault();
    void run(() => opsCall('linkKarigar', { userId: user.id, version: user.version, karigarId: linkCode.trim() }));
  };
  const fieldError = (f: string) => (error?.field === f ? error.message : undefined);
  const otherError = error && !['name', 'phone', 'email', 'karigarId'].includes(error.field ?? '') ? error.message : null;
  return (
    <DetailDrawer open onClose={onClose} title={user.name} subtitle={`${roleLabel(user.role)} · ${statusLabel(user)}`}>
      {otherError && (
        <div className="mb-4">
          <Notice tone="stop">{otherError}</Notice>
        </div>
      )}
      <form onSubmit={saveProfile} className="mb-6 space-y-3">
        <Field label="Name" error={fieldError('name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Phone" error={fieldError('phone')}>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
        </Field>
        <Field label="Email" error={fieldError('email')}>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="off" />
        </Field>
        <Button type="submit" variant="primary" disabled={busy}>
          Save details
        </Button>
      </form>
      <form onSubmit={saveRole} className="mb-6 space-y-3">
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value as RoleId)}>
            {ROLE_INFO.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        {role === 'karigar' && user.role !== 'karigar' && (
          <Field label="Karigar code" hint="The karigar record this user is, e.g. KG-04." error={fieldError('karigarId')}>
            <Input value={roleKarigar} onChange={(e) => setRoleKarigar(e.target.value)} autoComplete="off" />
          </Field>
        )}
        <Button type="submit" disabled={busy || role === user.role}>
          Change the role
        </Button>
      </form>
      {user.role === 'karigar' && (
        <form onSubmit={saveLink} className="space-y-3">
          <Field label="Linked karigar code" error={fieldError('karigarId')}>
            <Input value={linkCode} onChange={(e) => setLinkCode(e.target.value)} autoComplete="off" />
          </Field>
          <Button type="submit" disabled={busy || !linkCode.trim()}>
            Link karigar
          </Button>
        </form>
      )}
    </DetailDrawer>
  );
}
