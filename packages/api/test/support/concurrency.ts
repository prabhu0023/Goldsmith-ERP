/**
 * Helpers for tests where several callers act on the same record at once (EP-40-S7).
 * `releaseTogether` holds every call behind one barrier and then starts them in the same tick, so
 * their HTTP requests overlap. `expectExactlyOne` checks that exactly one call won and returns the
 * winner and the losers, for the test to assert on the losers' answers.
 */
export interface Answer {
  status: number;
  body: Record<string, unknown>;
}
/** Start every call at the same moment; resolves with the answers in the order of `calls`. */
export async function releaseTogether<T = Answer>(calls: ReadonlyArray<() => Promise<T>>): Promise<T[]> {
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const running = calls.map(async (call) => {
    await barrier;
    return call();
  });
  release();
  return Promise.all(running);
}
/** Fails unless exactly one answer is a success (status 200); returns it and the others. */
export function expectExactlyOne(results: readonly Answer[]): { winner: Answer; losers: Answer[] } {
  const winners = results.filter((r) => r.status === 200);
  if (winners.length !== 1) {
    const statuses = results.map((r) => r.status).join(', ');
    throw new Error(`expected exactly one success, got ${winners.length} (statuses: ${statuses})`);
  }
  return { winner: winners[0], losers: results.filter((r) => r.status !== 200) };
}
