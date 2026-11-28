import { describe, expect, it } from 'vitest';
import { createActionController, defineAction, defineAuthAction, MAYBE_NOT_SAVED_MESSAGE } from './action-controller';
import { createQueryClient, defineQuery } from './query-client';
import { deferred, fail, fakeApi, fakeTimers, flush, networkFail, ok } from './test-support';

const markLost = defineAction({
  op: 'markLeadLost',
  affects: () => [{ op: 'listUsers' }],
  fallback: 'The lead could not be marked lost. Try again.',
});
const listUsers = defineQuery({ op: 'listUsers', input: {} });

function setup(opts: { blocked?: { on: boolean; reason: string } } = {}) {
  const fake = fakeApi();
  const clock = fakeTimers();
  const queries = createQueryClient({ api: fake.api, now: clock.now, timers: clock.timers });
  let n = 0;
  const connection = { blocksActions: () => opts.blocked?.on ?? false, get reason() { return opts.blocked?.reason ?? ''; } };
  const controller = createActionController({ def: markLost, api: fake.api, queries, connection, newKey: () => `key-${++n}` });
  fake.on('listUsers', () => ok({ ok: true, items: [] }));
  return { fake, clock, queries, controller };
}
const lost = (leadId = 'L-1') => ({ leadId });
const keyOfCall = (fake: ReturnType<typeof fakeApi>, i: number) => fake.callsOf('markLeadLost')[i]?.opts?.idempotencyKey;

describe('refusal (S5)', () => {
  it('AC1 and AC3: the server sentence is shown beside the action and the action can be pressed again', async () => {
    const { fake, controller } = setup();
    fake.on('markLeadLost', () => fail('rule_refused', 'TAG-8841 is not in stock.'));
    const result = await controller.run(lost());
    expect(result).toEqual({ ok: false, code: 'rule_refused', message: 'TAG-8841 is not in stock.' });
    expect(controller.getSnapshot()).toEqual({
      status: 'refused',
      refusal: { code: 'rule_refused', message: 'TAG-8841 is not in stock.' },
      maybeNotSaved: false,
    });
    fake.on('markLeadLost', () => ok({ ok: true }));
    expect((await controller.run(lost())).ok).toBe(true);
    expect(controller.getSnapshot().status).toBe('saved');
  });

  it('AC4: with no sentence from the server the fallback is shown', async () => {
    const { fake, controller } = setup();
    fake.on('markLeadLost', () => fail('internal', ''));
    const result = await controller.run(lost());
    expect(result).toMatchObject({ ok: false, message: 'The lead could not be marked lost. Try again.' });
  });

  it('keeps the field of a validation refusal', async () => {
    const { fake, controller } = setup();
    fake.on('markLeadLost', () => fail('validation', 'leadId is not valid.', { field: 'leadId' }));
    expect(await controller.run(lost())).toMatchObject({ ok: false, field: 'leadId' });
    expect(controller.getSnapshot().refusal).toMatchObject({ field: 'leadId' });
  });

  it('S7 AC3: a refusal invalidates nothing', async () => {
    const { fake, clock, queries, controller } = setup();
    fake.on('markLeadLost', () => fail('rule_refused', 'A converted lead cannot be marked lost.'));
    queries.subscribe(listUsers, () => {});
    await flush();
    await controller.run(lost());
    await clock.advance(1000);
    expect(fake.callsOf('listUsers')).toHaveLength(1);
  });

  it('AC5: a conflict keeps the server sentence and refetches what the action affects', async () => {
    const { fake, clock, queries, controller } = setup();
    fake.on('markLeadLost', () => fail('conflict', 'Rajesh Verma changed this lead a moment ago.'));
    queries.subscribe(listUsers, () => {});
    await flush();
    const result = await controller.run(lost());
    expect(result).toMatchObject({ ok: false, code: 'conflict', message: 'Rajesh Verma changed this lead a moment ago.' });
    expect(controller.getSnapshot().refusal?.message).toBe('Rajesh Verma changed this lead a moment ago.');
    await clock.advance(300);
    expect(fake.callsOf('listUsers')).toHaveLength(2);
  });
});

describe('success and the reads it affects (S7)', () => {
  it('AC1-2: the affected read is refetched before the result is returned', async () => {
    const { fake, queries, controller } = setup();
    fake.on('markLeadLost', () => ok({ ok: true }));
    queries.subscribe(listUsers, () => {});
    await flush();
    const order: string[] = [];
    fake.on('listUsers', () => {
      order.push('refetch');
      return ok({ ok: true, items: ['fresh'] });
    });
    const result = await controller.run(lost());
    order.push('result');
    expect(order).toEqual(['refetch', 'result']);
    expect(result).toEqual({ ok: true, data: { ok: true }, refetchFailed: false });
    expect(queries.getSnapshot(listUsers).data).toMatchObject({ items: ['fresh'] });
  });

  it('AC5: the action is saved even when a refetch fails, and the result says so', async () => {
    const { fake, queries, controller } = setup();
    fake.on('markLeadLost', () => ok({ ok: true }));
    queries.subscribe(listUsers, () => {});
    await flush();
    fake.on('listUsers', () => fail('internal', 'down'));
    expect(await controller.run(lost())).toEqual({ ok: true, data: { ok: true }, refetchFailed: true });
    expect(controller.getSnapshot().status).toBe('saved');
  });
});

describe('a second press and a lost connection (S6)', () => {
  it('AC3: a second submit while working sends nothing', async () => {
    const { fake, controller } = setup();
    const gate = deferred<ReturnType<typeof ok>>();
    fake.on('markLeadLost', () => gate.promise);
    const first = controller.run(lost());
    expect(controller.getSnapshot().status).toBe('working');
    expect(await controller.run(lost())).toMatchObject({ ok: false, code: 'busy' });
    gate.resolve(ok({ ok: true }));
    await first;
    expect(fake.callsOf('markLeadLost')).toHaveLength(1);
  });

  it('AC1-2: after a network failure the message says it may not be saved, and retry reuses the key', async () => {
    const { fake, controller } = setup();
    const answers = [networkFail(), ok({ ok: true })];
    fake.on('markLeadLost', () => answers.shift() as never);
    const first = await controller.run(lost());
    expect(first).toMatchObject({ ok: false, network: true, message: MAYBE_NOT_SAVED_MESSAGE });
    expect(controller.getSnapshot()).toMatchObject({ status: 'network_failed', maybeNotSaved: true, refusal: null });
    expect((await controller.retry()).ok).toBe(true);
    expect(fake.callsOf('markLeadLost')).toHaveLength(2);
    expect(keyOfCall(fake, 0)).toBe('key-1');
    expect(keyOfCall(fake, 1)).toBe('key-1');
    expect(fake.callsOf('markLeadLost')[1]?.input).toEqual(lost());
  });

  it('AC4: a changed input after a network failure gets a new key', async () => {
    const { fake, controller } = setup();
    const answers = [networkFail(), ok({ ok: true })];
    fake.on('markLeadLost', () => answers.shift() as never);
    await controller.run(lost('L-1'));
    await controller.run(lost('L-2'));
    expect(keyOfCall(fake, 0)).toBe('key-1');
    expect(keyOfCall(fake, 1)).toBe('key-2');
  });

  it('a definitive answer drops the key: the next press of the same input is a new action', async () => {
    const { fake, controller } = setup();
    const answers = [networkFail(), fail('rule_refused', 'No.'), ok({ ok: true })];
    fake.on('markLeadLost', () => answers.shift() as never);
    await controller.run(lost());
    await controller.retry();
    await controller.run(lost());
    expect([0, 1, 2].map((i) => keyOfCall(fake, i))).toEqual(['key-1', 'key-1', 'key-2']);
  });

  it('AC5: a retry that finds the work done shows the server sentence', async () => {
    const { fake, controller } = setup();
    const answers = [networkFail(), fail('rule_refused', 'A converted lead cannot be marked lost.')];
    fake.on('markLeadLost', () => answers.shift() as never);
    await controller.run(lost());
    expect(await controller.retry()).toMatchObject({ ok: false, message: 'A converted lead cannot be marked lost.' });
    expect(controller.getSnapshot()).toMatchObject({ status: 'refused', maybeNotSaved: false });
  });

  it('retry with nothing to retry sends nothing', async () => {
    const { fake, controller } = setup();
    expect(await controller.retry()).toMatchObject({ ok: false });
    expect(fake.calls).toHaveLength(0);
  });
});

describe('offline (S11 AC3, D6)', () => {
  it('refuses without sending while the connection blocks actions, and keeps nothing', async () => {
    const blocked = { on: true, reason: 'You are offline. The server cannot be reached.' };
    const { fake, controller } = setup({ blocked });
    fake.on('markLeadLost', () => ok({ ok: true }));
    const result = await controller.run(lost());
    expect(result).toEqual({ ok: false, code: 'offline', message: blocked.reason });
    expect(fake.calls).toHaveLength(0);
    expect(controller.getSnapshot()).toMatchObject({ status: 'blocked', refusal: null });
    expect(await controller.retry()).toMatchObject({ ok: false });
    blocked.on = false;
    expect((await controller.run(lost())).ok).toBe(true);
    expect(fake.callsOf('markLeadLost')).toHaveLength(1);
  });

  it('a retry pending from a network failure is not sent while reconnecting, and is kept for after', async () => {
    const blocked = { on: false, reason: 'Reconnecting to the server. Try again when the connection is back.' };
    const { fake, controller } = setup({ blocked });
    const answers = [networkFail(), ok({ ok: true })];
    fake.on('markLeadLost', () => answers.shift() as never);
    await controller.run(lost());
    blocked.on = true;
    expect(await controller.retry()).toMatchObject({ ok: false, code: 'offline' });
    expect(fake.callsOf('markLeadLost')).toHaveLength(1);
    blocked.on = false;
    expect((await controller.retry()).ok).toBe(true);
    expect(keyOfCall(fake, 1)).toBe('key-1');
  });
});

describe('sign-in action', () => {
  it('runs an /api/auth operation with no key and no cached reads', async () => {
    const fake = fakeApi();
    const calls: Array<[string, unknown]> = [];
    const signIn = defineAuthAction({ op: 'signIn', fallback: 'Sign-in failed.' });
    const controller = createActionController({
      def: signIn,
      api: fake.api,
      authFn: async (op, input) => {
        calls.push([op, input]);
        return { ok: false, code: 'unauthenticated', message: 'Phone number or password is wrong.' };
      },
    });
    const result = await controller.run({ phone: '98410 11111', password: 'x' });
    expect(result).toMatchObject({ ok: false, code: 'unauthenticated', message: 'Phone number or password is wrong.' });
    expect(calls).toEqual([['signIn', { phone: '98410 11111', password: 'x' }]]);
    expect(fake.calls).toHaveLength(0);
  });

  it('an unreachable server is a plain refusal, not "may not have been saved"', async () => {
    const signIn = defineAuthAction({ op: 'signIn' });
    const controller = createActionController({
      def: signIn,
      api: fakeApi().api,
      authFn: async () => ({ ok: false, code: 'internal', message: 'Cannot reach the server. Check the connection and try again.', network: true }),
    });
    await controller.run({ phone: '98410 11111', password: 'x' });
    expect(controller.getSnapshot()).toMatchObject({ status: 'refused', maybeNotSaved: false });
  });
});
