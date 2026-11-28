import type { LiveClient } from '@goldsmith/shared';
import { describe, expect, it, vi } from 'vitest';
import { idleLiveClient } from '../live/use-live';
import { openLive } from '../live/LiveProvider';
describe('one live connection per signed-in person (EP-08-S8 AC1)', () => {
  it('creates one client, attaches the bridge before the one start, and stops it once on close', () => {
    const order: string[] = [];
    const client: LiveClient = {
      ...idleLiveClient,
      start: () => void order.push('start'),
      stop: () => void order.push('stop'),
    };
    const create = vi.fn(() => client);
    const detach = vi.fn(() => void order.push('detach'));
    const onClient = vi.fn((c: LiveClient) => {
      order.push('attach');
      expect(c).toBe(client);
      return detach;
    });
    const live = openLive(create, { onClient });
    live.start();
    live.close();
    expect(create).toHaveBeenCalledTimes(1);
    expect(onClient).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['attach', 'start', 'detach', 'stop']);
  });
  it('S7 AC5: a signed_out status calls onSignedOut', () => {
    let push: (s: 'signed_out' | 'open') => void = () => {};
    const client: LiveClient = {
      ...idleLiveClient,
      onStatus: (fn) => {
        push = fn;
        return () => {};
      },
    };
    const onSignedOut = vi.fn();
    openLive(() => client, { onSignedOut });
    push('open');
    expect(onSignedOut).not.toHaveBeenCalled();
    push('signed_out');
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });
});
