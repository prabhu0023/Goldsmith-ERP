/**
 * In-process wake-up after a commit that recorded a live event (EP-07-S1). It carries no event:
 * the publisher reads committed rows from outbox_events, so a missed wake-up only delays an event
 * until the next poll. Other API processes find the rows by polling.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

/** Call `listener` after each commit that recorded a live event; returns the unsubscribe. */
export function onLiveCommit(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Wake every listener; registered with `tx.afterCommit` by emitLiveEvent, never before a commit. */
export function notifyLiveCommit(): void {
  for (const listener of listeners) listener();
}
