import { Plus } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { defineAction } from '../../query/action-controller';
import { defineQuery } from '../../query/query-client';
import { useAction } from '../../query/use-action';
import { pagedBoundaryQuery, usePagedQuery } from '../../query/use-paged-query';
import { useQuery } from '../../query/use-query';
import { useNavigation } from '../../shell/navigation';
import { useSession } from '../../shell/session-context';
import { ActionButton, ActionError, Button, Card, DetailDrawer, Field, Input, Notice, PageHeader, Pill, QueryBoundary, ReadError, SectionLabel, StatusChip } from '../ui';
import { AllowanceSlider } from './AllowanceSlider';
import { accountLabel, againstAllowance, bpToPercent, isoDateLabel, jobStatusLabel, karigarDrawerNotice, karigarFieldErrors, karigarRefusal, lossLabel } from './karigar-rows';
import type { KarigarField, KarigarRow } from './karigar-rows';
import { SpecialtyChips } from './SpecialtyChips';
/** Every write here changes the directory, the scorecard and the picker, so they are read again from the server after it. */
const affectsKarigars = () => [{ op: 'listKarigars' }, { op: 'readKarigarScorecard' }, { op: 'listKarigarPicker' }];
export const updateKarigarDetails = defineAction({ op: 'updateKarigarDetails', affects: affectsKarigars });
export const updateKarigarWastage = defineAction({ op: 'updateKarigarWastage', affects: affectsKarigars });
export const updateKarigarStatus = defineAction({ op: 'updateKarigarStatus', affects: affectsKarigars });
/** A created portal user also shows in the staff list. */
export const linkKarigarAccount = defineAction({ op: 'linkKarigarAccount', affects: () => [...affectsKarigars(), { op: 'listUsers' }] });
const scorecardQuery = (karigarId: string) => defineQuery({ op: 'readKarigarScorecard', input: { karigarId } });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** Owner only: every karigar with the figures that judge them, worst first, and a scorecard of their jobs. */
export function Karigars() {
  const { can } = useSession();
  if (!can('listKarigars')) {
    return (
      <div>
        <PageHeader title="Karigars" />
        <Card>
          <p className="text-[15px] text-ink-2">Only the owner sees the karigar ledger.</p>
        </Card>
      </div>
    );
  }
  return <KarigarDirectory />;
}
function KarigarCard({ k, onOpen }: { k: KarigarRow; onOpen: () => void }) {
  const inside = k.metalLossBp === null || k.metalLossBp <= k.wastageBp;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[12rem]">
          <p className="text-[17px] font-semibold text-ink">
            {k.name} · <span className="font-mono">{k.id}</span>
          </p>
          <p className="text-sm text-ink-3">{k.specialties.join(' · ')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Pill>allows {bpToPercent(k.wastageBp)}% loss</Pill>
            <StatusChip tone={k.accountStatus === 'active' ? 'live' : k.accountStatus === 'none' ? 'closed' : 'wait'} label={accountLabel(k.accountStatus)} />
            {k.status === 'deactivated' && <StatusChip tone="closed" label="Deactivated" />}
          </div>
        </div>
        <Button onClick={onOpen}>Open</Button>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-ink-3">Gold with them</dt>
          <dd className="font-mono text-lg font-medium text-ink tabular">{k.goldWithG} g</dd>
          <dd className="text-[13px] text-ink-3">{plural(k.openJobs, 'open job')}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-3">Metal loss</dt>
          <dd className={`font-mono text-lg font-medium tabular ${inside ? 'text-ink' : 'text-stop'}`}>{lossLabel(k.metalLossBp)}</dd>
          {k.metalLossBp !== null && <dd className="text-[13px] text-ink-3">{inside ? 'Inside allowance' : 'Over allowance'}</dd>}
        </div>
        <div>
          <dt className="text-sm text-ink-3">Finished jobs</dt>
          <dd className="font-mono text-lg font-medium text-ink tabular">{k.finishedJobs > 0 ? k.finishedJobs : 'None yet'}</dd>
        </div>
      </dl>
    </Card>
  );
}
function KarigarDirectory() {
  const { go, route } = useNavigation();
  const list = usePagedQuery({ op: 'listKarigars', input: {} });
  const [openId, setOpenId] = useState<string | null>(route.params?.karigarId ?? null);
  const karigars = list.items;
  const open = karigars.find((k) => k.id === openId) ?? null;
  const active = karigars.filter((k) => k.status === 'active');
  const deactivated = karigars.filter((k) => k.status === 'deactivated');
  return (
    <div>
      <PageHeader
        title="Karigars"
        subtitle="The artisans you issue gold to, worst first. The allowance is what every one of their parcels is judged against."
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => go('karigar-new')}>
            Add a karigar
          </Button>
        }
      />
      <QueryBoundary label="karigar directory" query={pagedBoundaryQuery(list)}>
        {karigars.length === 0 ? (
          <Card>
            <p className="text-[15px] text-ink-2">No karigars yet. Add the first one.</p>
          </Card>
        ) : (
          <>
            <ul className="space-y-3">
              {active.map((k) => (
                <li key={k.id}>
                  <KarigarCard k={k} onOpen={() => setOpenId(k.id)} />
                </li>
              ))}
            </ul>
            {deactivated.length > 0 && (
              <section aria-label="Deactivated karigars" className="mt-6">
                <SectionLabel>Deactivated</SectionLabel>
                <ul className="mt-2 space-y-3">
                  {deactivated.map((k) => (
                    <li key={k.id}>
                      <KarigarCard k={k} onOpen={() => setOpenId(k.id)} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </QueryBoundary>
      {list.loadMoreError && (
        <div className="mt-3">
          <ReadError message={list.loadMoreError.message} code={list.loadMoreError.code} onRetry={list.loadMore} />
        </div>
      )}
      {list.loadingMore && <p className="mt-3 text-sm text-ink-3">Loading the karigar directory…</p>}
      {list.hasMore && !list.loadingMore && !list.loadMoreError && (
        <div className="mt-4">
          <Button onClick={list.loadMore}>Load more</Button>
        </div>
      )}
      {open && <KarigarDrawer key={open.id} karigar={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}
function Scorecard({ karigar }: { karigar: KarigarRow }) {
  const card = useQuery(scorecardQuery(karigar.id));
  const data = card.data;
  return (
    <QueryBoundary label="scorecard" query={card}>
      {data && (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-ink-3">Metal loss</dt>
              <dd className="font-mono text-lg font-medium text-ink tabular">{lossLabel(data.scorecard.metalLossBp)}</dd>
              <dd className="text-[13px] text-ink-3">
                {data.scorecard.metalLossBp === null
                  ? `allowance ${lossLabel(data.karigar.wastageBp)}`
                  : `allowance ${lossLabel(data.karigar.wastageBp)} (${againstAllowance(data.scorecard.metalLossBp, data.karigar.wastageBp)})`}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-ink-3">Delivers</dt>
              <dd className="font-mono text-lg font-medium text-ink tabular">
                {data.scorecard.finishedJobs > 0 ? plural(data.scorecard.daysLate, 'day') + ' late' : 'None yet'}
              </dd>
              <dd className="text-[13px] text-ink-3">over {plural(data.scorecard.finishedJobs, 'finished job')}</dd>
            </div>
          </dl>
          <div>
            <p className="text-sm text-ink-3">Last parcel gaps</p>
            {data.scorecard.lastGapsG.length > 0 ? (
              <>
                <p className="font-mono text-sm font-medium text-ink tabular">{data.scorecard.lastGapsG.map((g) => `${g} g`).join(', ')}</p>
                {data.scorecard.averageGapG && <p className="text-[13px] text-ink-3">average {data.scorecard.averageGapG} g</p>}
              </>
            ) : (
              <p className="font-mono text-sm font-medium text-ink">None yet</p>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-ink-4">Jobs</p>
            {data.jobs.length === 0 ? (
              <p className="text-sm text-ink-2">No jobs have been sent to {data.karigar.name} yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.jobs.map((j) => (
                  <li key={j.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
                    <span className="min-w-[8rem] flex-1">
                      <span className="block font-semibold text-ink">{j.title ?? 'Untitled job'}</span>
                      <span className="block font-mono text-[13px] text-ink-3">{j.id}</span>
                    </span>
                    <span className="text-ink-2">{jobStatusLabel(j.status)}</span>
                    <span className="font-mono tabular text-ink-2">{j.goldIssuedG} g issued</span>
                    {j.lossG !== null && <span className="font-mono tabular text-ink-3">loss {j.lossG} g</span>}
                    {j.dueDate && <span className="text-ink-3">due {isoDateLabel(j.dueDate)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </QueryBoundary>
  );
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-4">
      <SectionLabel>{title}</SectionLabel>
      <div className="mt-3">{children}</div>
    </section>
  );
}
const DRAWER_FIELDS: readonly KarigarField[] = ['name', 'phone', 'email', 'specialties', 'workshopLocation'];
type Refusal = { code: string; message: string; field?: string } | null;
/** A refusal that names a form field shows on that field; any other shows beside the form's button. */
const besideButton = (refusal: Refusal): Refusal => (refusal && !(refusal.code === 'validation' && DRAWER_FIELDS.includes(refusal.field as KarigarField)) ? refusal : null);
/**
 * One karigar: the scorecard, details, the allowance, portal access and deactivate or reactivate.
 * The drawer is keyed by the karigar's code only. It keeps what was typed and sends the version it
 * was opened with, so a change by someone else gets the server's conflict sentence and a refetched
 * row (EP-08-S9 AC3). A saved change closes it; the list shows the new row.
 */
function KarigarDrawer({ karigar, onClose }: { karigar: KarigarRow; onClose: () => void }) {
  const [openedVersion] = useState(karigar.version);
  const [name, setName] = useState(karigar.name);
  const [phone, setPhone] = useState(karigar.phone ?? '');
  const [email, setEmail] = useState(karigar.email);
  const [workshopLocation, setWorkshopLocation] = useState(karigar.workshopLocation ?? '');
  const [specialties, setSpecialties] = useState<string[]>(karigar.specialties);
  const [wastageBp, setWastageBp] = useState(karigar.wastageBp);
  const [errors, setErrors] = useState<Partial<Record<KarigarField, string>>>({});
  const details = useAction(updateKarigarDetails);
  const wastage = useAction(updateKarigarWastage);
  const status = useAction(updateKarigarStatus);
  const access = useAction(linkKarigarAccount);
  const closeWhenSaved = (result: { ok: boolean }) => {
    if (result.ok) onClose();
  };
  const refused = karigarRefusal(details.refusal);
  const fieldError = (f: KarigarField): string | undefined => errors[f] ?? (refused && 'field' in refused && refused.field === f ? refused.message : undefined);
  const saveDetails = (e: FormEvent) => {
    e.preventDefault();
    const found = karigarFieldErrors({ name, phone, email, specialties });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    void details
      .run({
        karigarId: karigar.id,
        version: openedVersion,
        name: name.trim(),
        phone,
        email: email.trim(),
        ...(workshopLocation.trim() ? { workshopLocation: workshopLocation.trim() } : {}),
        specialties,
      })
      .then(closeWhenSaved);
  };
  const saveWastage = (e: FormEvent) => {
    e.preventDefault();
    void wastage.run({ karigarId: karigar.id, version: openedVersion, wastageBp }).then(closeWhenSaved);
  };
  const deactivated = karigar.status === 'deactivated';
  const changed = karigarDrawerNotice(openedVersion, karigar.version);
  return (
    <DetailDrawer open onClose={onClose} title={`${karigar.name} · ${karigar.id}`} subtitle={`${deactivated ? 'Deactivated' : 'Active'} · ${accountLabel(karigar.accountStatus)}`}>
      {changed && (
        <div className="mb-4">
          <Notice tone="wait">{changed}</Notice>
        </div>
      )}
      <div className="mb-6">
        <SectionLabel>Scorecard</SectionLabel>
        <div className="mt-2">
          <Scorecard karigar={karigar} />
        </div>
      </div>
      <Section title="Edit details">
        <form onSubmit={saveDetails} className="mb-6 space-y-3">
          <Field label="Name" error={fieldError('name')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Phone" error={fieldError('phone')}>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </Field>
          <Field label="Email" error={fieldError('email')}>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="off" />
          </Field>
          <Field label="Workshop location" error={fieldError('workshopLocation')}>
            <Input value={workshopLocation} onChange={(e) => setWorkshopLocation(e.target.value)} autoComplete="off" />
          </Field>
          <SpecialtyChips value={specialties} onChange={setSpecialties} error={fieldError('specialties')} />
          <ActionButton type="submit" variant="primary" busy={details.busy}>
            Save details
          </ActionButton>
          <ActionError refusal={besideButton(details.refusal)} maybeNotSaved={details.maybeNotSaved} onRetry={() => void details.retry().then(closeWhenSaved)} busy={details.busy} />
        </form>
      </Section>
      <Section title="Wastage allowance">
        <form onSubmit={saveWastage} className="mb-6 space-y-3">
          <AllowanceSlider bp={wastageBp} onChange={setWastageBp} label={`Allowed loss for ${karigar.name} in percent`} />
          <ActionButton type="submit" busy={wastage.busy} disabled={wastageBp === karigar.wastageBp}>
            Change the allowance
          </ActionButton>
          <ActionError refusal={wastage.refusal} maybeNotSaved={wastage.maybeNotSaved} onRetry={() => void wastage.retry().then(closeWhenSaved)} busy={wastage.busy} />
        </form>
      </Section>
      <Section title="Portal access">
        <div className="mb-6 space-y-3">
          <p className="text-sm text-ink-2">{accountLabel(karigar.accountStatus)}</p>
          {karigar.accountStatus === 'none' && (
            <ActionButton busy={access.busy} onClick={() => void access.run({ karigarId: karigar.id })}>
              Give portal access
            </ActionButton>
          )}
          <ActionError refusal={access.refusal} maybeNotSaved={access.maybeNotSaved} onRetry={() => void access.retry()} busy={access.busy} />
        </div>
      </Section>
      <div className="space-y-3">
        <ActionButton
          variant={deactivated ? 'secondary' : 'danger'}
          busy={status.busy}
          onClick={() => void status.run({ karigarId: karigar.id, version: openedVersion, status: deactivated ? 'active' : 'deactivated' }).then(closeWhenSaved)}
        >
          {deactivated ? 'Reactivate' : 'Deactivate'}
        </ActionButton>
        <ActionError refusal={status.refusal} maybeNotSaved={status.maybeNotSaved} onRetry={() => void status.retry().then(closeWhenSaved)} busy={status.busy} />
      </div>
    </DetailDrawer>
  );
}
