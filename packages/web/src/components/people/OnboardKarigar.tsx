import { useState } from 'react';
import type { FormEvent } from 'react';
import { defineAction } from '../../query/action-controller';
import { useAction } from '../../query/use-action';
import { useNavigation } from '../../shell/navigation';
import { useSession } from '../../shell/session-context';
import { ActionButton, ActionError, Button, Card, Field, Input, PageHeader, SectionLabel } from '../ui';
import { AllowanceSlider } from './AllowanceSlider';
import { karigarFieldErrors, karigarRefusal } from './karigar-rows';
import type { KarigarField } from './karigar-rows';
import { SpecialtyChips } from './SpecialtyChips';
/** The new karigar shows in the directory and the picker, which are read again once they are saved. */
export const onboardKarigar = defineAction({
  op: 'onboardKarigar',
  affects: () => [{ op: 'listKarigars' }, { op: 'listKarigarPicker' }],
});
const OWNER_ONLY = 'Only the owner can add a karigar or change their wastage allowance.';
/** Screen 24. Owner only. The wastage allowance set here is the window on every job sheet. */
export function OnboardKarigar() {
  const { can } = useSession();
  if (!can('onboardKarigar')) {
    return (
      <div>
        <PageHeader title="Add a karigar" />
        <Card>
          <p className="text-[15px] text-ink-2">{OWNER_ONLY}</p>
        </Card>
      </div>
    );
  }
  return <AddKarigarForm />;
}
function AddKarigarForm() {
  const { go } = useNavigation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [workshopLocation, setWorkshopLocation] = useState('');
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [wastageBp, setWastageBp] = useState(80);
  const [errors, setErrors] = useState<Partial<Record<KarigarField, string>>>({});
  // The action keeps one key across "Try again" after a lost answer, so the karigar is added once.
  const create = useAction(onboardKarigar);
  const refused = karigarRefusal(create.refusal);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = karigarFieldErrors({ name, phone, email, specialties });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const answer = await create.run({
      name: name.trim(),
      phone,
      email: email.trim(),
      ...(workshopLocation.trim() ? { workshopLocation: workshopLocation.trim() } : {}),
      specialties,
      wastageBp,
    });
    if (answer.ok) go('karigars', { karigarId: answer.data.id });
  };
  const retry = async () => {
    const answer = await create.retry();
    if (answer.ok) go('karigars', { karigarId: answer.data.id });
  };
  const fieldError = (f: KarigarField): string | undefined => errors[f] ?? (refused && 'field' in refused && refused.field === f ? refused.message : undefined);
  return (
    <form onSubmit={(e) => void submit(e)} className="mx-auto max-w-2xl">
      <PageHeader title="Add a karigar" subtitle="An artisan you issue gold to. The wastage you allow here is what every one of their parcels is judged against." />
      <Card className="mb-4 space-y-4">
        <SectionLabel>Who they are</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <Field label="Name" error={fieldError('name')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Code">
            <Input value="Given when you save" readOnly aria-readonly className="font-mono" />
          </Field>
        </div>
        <Field label="Phone · their job portal logs in with this" error={fieldError('phone')}>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+91 94431 55082" />
        </Field>
        <Field label="Email · the activation link goes here" error={fieldError('email')}>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="off" />
        </Field>
        <Field label="Workshop location" error={fieldError('workshopLocation')}>
          <Input value={workshopLocation} onChange={(e) => setWorkshopLocation(e.target.value)} autoComplete="off" />
        </Field>
        <SpecialtyChips value={specialties} onChange={setSpecialties} error={fieldError('specialties')} />
      </Card>
      <Card className="mb-4 space-y-3">
        <SectionLabel>The wastage you allow them</SectionLabel>
        <p className="text-sm text-ink-3">How much metal they may lose, as a share of gold issued.</p>
        <AllowanceSlider bp={wastageBp} onChange={setWastageBp} />
        <p className="text-[13px] text-ink-3">The usual range for hand-made work. You can move it per karigar. This feeds their scorecard.</p>
      </Card>
      <div className="mb-4">
        <ActionError
          refusal={refused && 'notice' in refused ? { message: refused.notice } : null}
          maybeNotSaved={create.maybeNotSaved}
          onRetry={() => void retry()}
          busy={create.busy}
        />
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <ActionButton type="submit" variant="primary" busy={create.busy}>
          Add this karigar
        </ActionButton>
        <Button onClick={() => go('karigars')}>Cancel</Button>
      </div>
      <p className="mt-3 text-[13px] text-ink-3">{OWNER_ONLY}</p>
    </form>
  );
}
