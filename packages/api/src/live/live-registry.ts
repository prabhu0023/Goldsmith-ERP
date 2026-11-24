/**
 * The open streams of this process, by connection id, for the live operations (live-operations.ts)
 * that arrive as ordinary API calls. A stream is served by one process; with several API
 * processes a call must reach the process holding its stream (a deployment follow-up).
 */
import type { LivePresenceOther, RoleId } from '@goldsmith/shared';

export interface LiveConnectionHandle {
  readonly id: string;
  readonly userId: string;
  readonly shopId: string;
  readonly role: RoleId;
  channels(): ReadonlySet<string>;
  subscribe(channel: string): void;
  unsubscribe(channel: string): void;
  presenceOthers(parcelId: string): LivePresenceOther[];
  /** Join, or refresh as the heartbeat; also subscribes to the parcel's channel. */
  joinPresence(parcelId: string): void;
  leavePresence(parcelId: string): void;
}

const open = new Map<string, LiveConnectionHandle>();

export function registerLiveConnection(handle: LiveConnectionHandle): void {
  open.set(handle.id, handle);
}

export function unregisterLiveConnection(id: string): void {
  open.delete(id);
}

export function findLiveConnection(id: string): LiveConnectionHandle | undefined {
  return open.get(id);
}
