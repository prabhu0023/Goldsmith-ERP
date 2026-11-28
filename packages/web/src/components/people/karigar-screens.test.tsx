import { describe, expect, it } from 'vitest';
import { createActionController } from '../../query/action-controller';
import { createConnectionStore } from '../../query/connection';
import { createQueryClient, defineQuery } from '../../query/query-client';
import { fail, fakeApi, fakeTimers, flush, networkFail, ok } from '../../query/test-support';
import { renderAs } from '../../test-support/render-as';
import { KarigarPicker, pickerOptionHint, pickerOptionLabel } from './KarigarPicker';
import { Karigars, updateKarigarDetails } from './Karigars';
import { onboardKarigar, OnboardKarigar } from './OnboardKarigar';
import { karigarRefusal } from './karigar-rows';
import type { KarigarRow } from './karigar-rows';
const row = (over: Partial<KarigarRow>): KarigarRow => ({
  id: 'KG-01',
  name: 'Lakshmi Devi',
  phone: '+919443155082',
  email: 'lakshmi@example.com',
  workshopLocation: 'Karaikudi',
  specialties: ['Chettinad'],
  wastageBp: 70,
  status: 'active',
  version: 1,
  accountStatus: 'active',
  openJobs: 2,
  goldWithG: '312.5000',
  metalLossBp: 60,
  finishedJobs: 4,
  ...over,
});
const page = (items: unknown[]) => ok({ ok: true, items, nextCursor: null, pageSize: 50 });
/** A cache whose first read of `op` has been answered (or failed) before the screen renders. */
async function cacheAfter(op: 'listKarigars' | 'listKarigarPicker', answer: ReturnType<typeof ok>) {
  const fake = fakeApi();
  const clock = fakeTimers();
  const queries = createQueryClient({ api: fake.api, now: clock.now, timers: clock.timers });
  fake.on(op, () => answer);
  queries.subscribe(defineQuery({ op, input: {} }), () => {});
  await flush();
  return queries;
}
const directory = [
  row({ id: 'KG-03', name: 'Mahesh Kumar', wastageBp: 80, metalLossBp: 142, accountStatus: 'none' }),
  row({ id: 'KG-02', name: 'Vijay Anand', wastageBp: 90, metalLossBp: 85 }),
  row({ id: 'KG-04', name: 'Anil Rao', metalLossBp: null, finishedJobs: 0, goldWithG: '0.0000', openJobs: 0 }),
  row({ id: 'KG-05', name: 'Ravi Achari', status: 'deactivated', accountStatus: 'deactivated' }),
];
describe('karigar directory (EP-16-S9)', () => {
  it('while the read is pending the owner sees loading and no empty state', () => {
    const html = renderAs('Sanjay Seth', 'owner', <Karigars />);
    expect(html).toContain('Loading the karigar directory…');
    expect(html).toContain('role="status"');
    expect(html).toContain('Add a karigar');
    expect(html).not.toContain('No karigars yet');
  });
  it('a finished read with no rows shows the empty sentence', async () => {
    const queries = await cacheAfter('listKarigars', page([]));
    const html = renderAs('Sanjay Seth', 'owner', <Karigars />, { queries });
    expect(html).toContain('No karigars yet. Add the first one.');
    expect(html).not.toContain('Loading the karigar directory');
  });
  it('shows the rows in the server order, active first, then the Deactivated group', async () => {
    const queries = await cacheAfter('listKarigars', page(directory));
    const html = renderAs('Sanjay Seth', 'owner', <Karigars />, { queries });
    const at = (text: string) => html.indexOf(text);
    expect(at('Mahesh Kumar')).toBeGreaterThan(-1);
    expect(at('Mahesh Kumar')).toBeLessThan(at('Vijay Anand'));
    expect(at('Vijay Anand')).toBeLessThan(at('Anil Rao'));
    expect(at('Anil Rao')).toBeLessThan(at('Deactivated</'));
    expect(at('Deactivated</')).toBeLessThan(at('Ravi Achari'));
    expect(html).toContain('1.42%');
    expect(html).toContain('allows 0.80% loss');
    expect(html).toContain('312.5000 g');
    expect(html).toContain('2 open jobs');
    expect(html).toContain('No portal access');
  });
  it('says None yet where there is no figure, and shows no rating, price or currency sign', async () => {
    const queries = await cacheAfter('listKarigars', page(directory));
    const html = renderAs('Sanjay Seth', 'owner', <Karigars />, { queries });
    expect(html).toContain('None yet');
    expect(html).not.toMatch(/rating/i);
    expect(html).not.toMatch(/₹|Rs\.|INR/);
  });
  it('an unreachable server says the directory could not be loaded and offers Try again', async () => {
    const queries = await cacheAfter('listKarigars', networkFail());
    const html = renderAs('Sanjay Seth', 'owner', <Karigars />, { queries });
    expect(html).toContain('The karigar directory could not be loaded.');
    expect(html).toContain('Try again');
    expect(html).not.toContain('No karigars yet');
  });
  it('staff see the owner-only sentence and no directory', () => {
    const html = renderAs('Rajesh Verma', 'staff', <Karigars />);
    expect(html).toContain('Only the owner sees the karigar ledger.');
    expect(html).not.toContain('Add a karigar');
  });
});
describe('add a karigar (EP-16-S3)', () => {
  it('the owner sees the form: slider, example line, code given on save, no language chips', () => {
    const html = renderAs('Sanjay Seth', 'owner', <OnboardKarigar />);
    for (const text of ['Name', 'Phone', 'Email', 'Workshop location', 'Chettinad', 'Meenakari', 'Given when you save', 'Add this karigar']) expect(html).toContain(text);
    expect(html).toContain('On a 160 g job, that means up to');
    expect(html).toContain('1.2800 g');
    expect(html).toContain('min="0.6"');
    expect(html).toContain('max="1.2"');
    expect(html).not.toContain('Language');
    expect(html).not.toContain('தமிழ்');
  });
  it('while the connection is down the submit is disabled and says why', () => {
    const connection = createConnectionStore({ windowLike: null });
    connection.setLiveStatus('reconnecting');
    const html = renderAs('Sanjay Seth', 'owner', <OnboardKarigar />, { connection });
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Add this karigar<|<button[^>]*disabled=""[^>]*type="submit"[^>]*>Add this karigar</);
    expect(html).toContain('Reconnecting to the server. Try again when the connection is back.');
  });
  it('staff see the owner-only sentence and no form', () => {
    const html = renderAs('Rajesh Verma', 'staff', <OnboardKarigar />);
    expect(html).toContain('Only the owner can add a karigar or change their wastage allowance.');
    expect(html).not.toContain('Add this karigar');
  });
  it('the session permissions decide, not the role alone', () => {
    expect(renderAs('Sanjay Seth', 'owner', <OnboardKarigar />, { permissions: [] })).not.toContain('Add this karigar');
  });
});
describe('karigar actions with the real operations (S3, S4, S9)', () => {
  const listKarigars = defineQuery({ op: 'listKarigars', input: {} });
  const newKarigar = { name: 'Lakshmi Devi', phone: '+919443155082', email: 'lakshmi@example.com', specialties: ['Chettinad'], wastageBp: 70 };
  async function setup() {
    const fake = fakeApi();
    const clock = fakeTimers();
    const queries = createQueryClient({ api: fake.api, now: clock.now, timers: clock.timers });
    let rows: KarigarRow[] = [];
    fake.on('listKarigars', () => page(rows));
    fake.on('listKarigarPicker', () => page([]));
    queries.subscribe(listKarigars, () => {});
    await flush();
    return { fake, clock, queries, setRows: (next: KarigarRow[]) => (rows = next) };
  }
  it('after a karigar is added the directory is read again and shows them', async () => {
    const { fake, queries, setRows } = await setup();
    const controller = createActionController({ def: onboardKarigar, api: fake.api, queries, newKey: () => 'key-1' });
    fake.on('onboardKarigar', () => {
      setRows([row({})]);
      return ok({ ok: true, id: 'KG-01' });
    });
    expect(await controller.run(newKarigar)).toMatchObject({ ok: true, data: { id: 'KG-01' } });
    await flush();
    expect(fake.callsOf('listKarigars')).toHaveLength(2);
    expect(queries.getSnapshot(listKarigars).data).toMatchObject({ items: [{ name: 'Lakshmi Devi' }] });
  });
  it('a duplicate phone is refused on the phone field and nothing is read again', async () => {
    const { fake, queries } = await setup();
    const controller = createActionController({ def: onboardKarigar, api: fake.api, queries, newKey: () => 'key-1' });
    const sentence = 'This phone number is already used by another account.';
    fake.on('onboardKarigar', () => fail('validation', sentence, { field: 'phone' }));
    expect(await controller.run(newKarigar)).toMatchObject({ ok: false, code: 'validation', field: 'phone' });
    expect(karigarRefusal(controller.getSnapshot().refusal)).toEqual({ field: 'phone', message: sentence });
    expect(fake.callsOf('listKarigars')).toHaveLength(1);
  });
  it('an allowance outside the range is a sentence beside the button, not on a field', async () => {
    const { fake, queries } = await setup();
    const controller = createActionController({ def: onboardKarigar, api: fake.api, queries, newKey: () => 'key-1' });
    fake.on('onboardKarigar', () => fail('rule_refused', 'The wastage allowance is between 0.6% and 1.2%.'));
    await controller.run({ ...newKarigar, wastageBp: 200 });
    expect(karigarRefusal(controller.getSnapshot().refusal)).toEqual({ notice: 'The wastage allowance is between 0.6% and 1.2%.' });
  });
  it('an edit changed by someone else is a conflict, and the directory is read again', async () => {
    const { fake, clock, queries } = await setup();
    const controller = createActionController({ def: updateKarigarDetails, api: fake.api, queries, newKey: () => 'key-2' });
    fake.on('updateKarigarDetails', () => fail('conflict', 'This record was changed by someone else.'));
    const result = await controller.run({ karigarId: 'KG-01', version: 1, name: 'Lakshmi D', phone: '+919443155082', email: 'lakshmi@example.com', specialties: ['Temple'] });
    expect(result).toMatchObject({ ok: false, code: 'conflict' });
    await clock.advance(300);
    expect(fake.callsOf('listKarigars')).toHaveLength(2);
  });
});
describe('karigar picker (EP-16-S8)', () => {
  const pickerRows = [
    { id: 'KG-01', name: 'Lakshmi Devi', specialties: ['Chettinad', 'Temple'], wastageBp: 70 },
    { id: 'KG-02', name: 'Vijay Anand', specialties: [], wastageBp: 100 },
  ];
  it('labels an option with the name and code, and a hint with the specialty and allowance', () => {
    expect(pickerOptionLabel(pickerRows[0])).toBe('Lakshmi Devi · KG-01');
    expect(pickerOptionHint(pickerRows[0])).toBe('Chettinad specialist · 0.7% loss');
    expect(pickerOptionHint(pickerRows[1])).toBe('1% loss');
  });
  it('lists the active karigars and shows no phone, location or scorecard phrase', async () => {
    const queries = await cacheAfter('listKarigarPicker', page(pickerRows));
    const html = renderAs('Rajesh Verma', 'staff', <KarigarPicker value="KG-01" onChange={() => {}} />, { queries });
    expect(html).toContain('Lakshmi Devi · KG-01');
    expect(html).toContain('Vijay Anand · KG-02');
    expect(html).toContain('Chettinad specialist · 0.7% loss');
    expect(html).not.toMatch(/\+91|Karaikudi|always on time|late|None yet|rating/i);
  });
  it('while the read is pending it says it is loading', () => {
    const html = renderAs('Rajesh Verma', 'staff', <KarigarPicker value="" onChange={() => {}} />);
    expect(html).toContain('Loading the karigar list…');
  });
});
