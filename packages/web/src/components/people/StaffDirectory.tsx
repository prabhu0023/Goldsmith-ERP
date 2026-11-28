import { ROLE_INFO } from '@goldsmith/shared';
import type { RoleId } from '@goldsmith/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { type ActionDef, defineAction } from '../../query/action-controller';
import { useAction } from '../../query/use-action';
import { pagedBoundaryQuery, usePagedQuery } from '../../query/use-paged-query';
import { useNavigation } from '../../shell/navigation';
import { useSession } from '../../shell/session-context';
import { ActionButton, ActionError, Button, Card, DetailDrawer, Field, Input, Notice, PageHeader, QueryBoundary, ReadError, Select, StatusChip } from '../ui';
import type { Tone } from '../ui';
import { initialsOf } from './util';
import { drawerNotice, rowActions, statusLabel } from './user-rows';
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
/** Every write here changes the user list, so the list is read again from the server after it (S7). */
const affectsList = () => [{ op: 'listUsers' }];
const resendActivation = defineAction({ op: 'resendActivation', affects: affectsList });
const deactivateUser = defineAction({ op: 'deactivateUser', affects: affectsList });
const reactivateUser = defineAction({ op: 'reactivateUser', affects: affectsList });
const unlockUser = defineAction({ op: 'unlockUser', affects: affectsList });
const updateUserProfile = defineAction({ op: 'updateUserProfile', affects: affectsList });
const updateUserRole = defineAction({ op: 'updateUserRole', affects: affectsList });
const linkKarigar = defineAction({ op: 'linkKarigar', affects: affectsList });
/** One row button with its own action, so a refusal shows under the button that caused it. */
function RowActionButton<I, R>({ def, input, action }: { def: ActionDef<I, R>; input: I; action: RowAction }) {
  const handle = useAction(def);
  return (
    <div className="flex flex-col items-start gap-1">
      <ActionButton size="sm" variant={action === 'deactivate' ? 'danger' : 'secondary'} busy={handle.busy} onClick={() => void handle.run(input)}>
        {ACTION_LABEL[action]}
      </ActionButton>
      <ActionError refusal={handle.refusal} maybeNotSaved={handle.maybeNotSaved} onRetry={() => void handle.retry()} busy={handle.busy} />
    </div>
  );
}
function RowActionFor({ action, u }: { action: RowAction; u: UserRow }) {
  switch (action) {
    case 'resend':
      return <RowActionButton def={resendActivation} input={{ userId: u.id }} action={action} />;
    case 'deactivate':
      return <RowActionButton def={deactivateUser} input={{ userId: u.id, version: u.version }} action={action} />;
    case 'reactivate':
      return <RowActionButton def={reactivateUser} input={{ userId: u.id, version: u.version }} action={action} />;
    case 'unlock':
      return <RowActionButton def={unlockUser} input={{ userId: u.id }} action={action} />;
  }
}
/** Owner only (EP-05-S11). Every user of the shop from the server, their role, status and actions. */
export function StaffDirectory() {
  const { can } = useSession();
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
  const { go } = useNavigation();
  const list = usePagedQuery({ op: 'listUsers', input: {} });
  const [openId, setOpenId] = useState<string | null>(null);
  const users = list.items;
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
      <QueryBoundary label="staff list" query={pagedBoundaryQuery(list)}>
        {users.length === 0 ? (
          <Card>
            <p className="text-[15px] text-ink-2">No staff yet. Add the first person.</p>
          </Card>
        ) : (
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
                  <div className="flex flex-wrap items-start gap-2">
                    {rowActions(u).map((a) => (
                      <RowActionFor key={a} action={a} u={u} />
                    ))}
                    <Button size="sm" variant="ghost" onClick={() => setOpenId(u.id)}>
                      Open
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </QueryBoundary>
      {list.loadMoreError && (
        <div className="mt-3">
          <ReadError message={list.loadMoreError.message} code={list.loadMoreError.code} onRetry={list.loadMore} />
        </div>
      )}
      {list.loadingMore && <p className="mt-3 text-sm text-ink-3">Loading the staff list…</p>}
      {list.hasMore && !list.loadingMore && !list.loadMoreError && (
        <div className="mt-4">
          <Button onClick={list.loadMore}>Load more</Button>
        </div>
      )}
      {open && <UserDrawer key={open.id} user={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}
const DRAWER_FIELDS = ['name', 'phone', 'email', 'karigarId'];
type Refusal = { message: string; field?: string } | null;
const onField = (refusal: Refusal, field: string) => (refusal?.field === field ? refusal.message : undefined);
/** A refusal that names a form field shows on that field; any other shows beside the form's button. */
const besideButton = (refusal: Refusal) => (refusal && !DRAWER_FIELDS.includes(refusal.field ?? '') ? refusal : null);
/**
 * Edit one user: name, phone, email (S5), role (S6) and the karigar link (S13). The drawer is keyed
 * by the user's id only. It keeps what was typed and sends the version it was opened with, so a
 * change by someone else gets the server's conflict sentence and a refetched row (EP-08-S9 AC3).
 */
function UserDrawer({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [openedVersion] = useState(user.version);
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<RoleId>(user.role);
  const [roleKarigar, setRoleKarigar] = useState('');
  const [linkCode, setLinkCode] = useState(user.karigarId ?? '');
  const profile = useAction(updateUserProfile);
  const roleChange = useAction(updateUserRole);
  const link = useAction(linkKarigar);
  const closeWhenSaved = (result: { ok: boolean }) => {
    if (result.ok) onClose();
  };
  const saveProfile = (e: FormEvent) => {
    e.preventDefault();
    void profile.run({ userId: user.id, version: openedVersion, name, phone, email }).then(closeWhenSaved);
  };
  const saveRole = (e: FormEvent) => {
    e.preventDefault();
    const karigarId = role === 'karigar' && roleKarigar.trim() ? { karigarId: roleKarigar.trim() } : {};
    void roleChange.run({ userId: user.id, version: openedVersion, role, ...karigarId }).then(closeWhenSaved);
  };
  const saveLink = (e: FormEvent) => {
    e.preventDefault();
    void link.run({ userId: user.id, version: openedVersion, karigarId: linkCode.trim() }).then(closeWhenSaved);
  };
  const changed = drawerNotice(openedVersion, user.version);
  return (
    <DetailDrawer open onClose={onClose} title={user.name} subtitle={`${roleLabel(user.role)} · ${statusLabel(user)}`}>
      {changed && (
        <div className="mb-4">
          <Notice tone="wait">{changed}</Notice>
        </div>
      )}
      <form onSubmit={saveProfile} className="mb-6 space-y-3">
        <Field label="Name" error={onField(profile.refusal, 'name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Phone" error={onField(profile.refusal, 'phone')}>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
        </Field>
        <Field label="Email" error={onField(profile.refusal, 'email')}>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="off" />
        </Field>
        <ActionButton type="submit" variant="primary" busy={profile.busy}>
          Save details
        </ActionButton>
        <ActionError refusal={besideButton(profile.refusal)} maybeNotSaved={profile.maybeNotSaved} onRetry={() => void profile.retry().then(closeWhenSaved)} busy={profile.busy} />
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
          <Field label="Karigar code" hint="The karigar record this user is, e.g. KG-04." error={onField(roleChange.refusal, 'karigarId')}>
            <Input value={roleKarigar} onChange={(e) => setRoleKarigar(e.target.value)} autoComplete="off" />
          </Field>
        )}
        <ActionButton type="submit" busy={roleChange.busy} disabled={role === user.role}>
          Change the role
        </ActionButton>
        <ActionError refusal={besideButton(roleChange.refusal)} maybeNotSaved={roleChange.maybeNotSaved} onRetry={() => void roleChange.retry().then(closeWhenSaved)} busy={roleChange.busy} />
      </form>
      {user.role === 'karigar' && (
        <form onSubmit={saveLink} className="space-y-3">
          <Field label="Linked karigar code" error={onField(link.refusal, 'karigarId')}>
            <Input value={linkCode} onChange={(e) => setLinkCode(e.target.value)} autoComplete="off" />
          </Field>
          <ActionButton type="submit" busy={link.busy} disabled={!linkCode.trim()}>
            Link karigar
          </ActionButton>
          <ActionError refusal={besideButton(link.refusal)} maybeNotSaved={link.maybeNotSaved} onRetry={() => void link.retry().then(closeWhenSaved)} busy={link.busy} />
        </form>
      )}
    </DetailDrawer>
  );
}
