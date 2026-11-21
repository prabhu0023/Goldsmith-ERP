import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { initialState } from '../data/seed';
import { demoNow } from '@goldsmith/shared';
import { landingRoute } from '../nav';
import type { Route, RouteId } from '../nav';
import type { Actor, AppState, ErrorCode, Identity, OperationInput, RoleId, Settings } from '@goldsmith/shared';
import { actorOf, identities as identitiesOf } from './selectors';
import * as T from './transitions';

export interface ActionResult {
  ok: boolean;
  /** A sentence fit to show a person when ok is false. */
  error?: string;
  /** The contract error code when ok is false. */
  code?: ErrorCode;
  /** The id of whatever the action created. */
  id?: string;
}

type Without<A> = Omit<A, 'by' | 'at'>;
type Out = AppState | T.Made;

function buildActions(run: (fn: (s: AppState) => Out) => ActionResult, ctx: () => T.Ctx) {
  const act =
    <A extends T.Ctx>(fn: (s: AppState, a: A) => Out) =>
    (a: Without<A>): ActionResult =>
      run((s) => fn(s, { ...a, ...ctx() } as unknown as A));

  return {
    // leads and order copies
    createLead: act(T.createLead),
    confirmLead: act(T.confirmLead),
    startWorkingLead: act(T.startWorkingLead),
    markLeadLost: (a: OperationInput<'markLeadLost'>): ActionResult => run((s) => T.markLeadLost(s, { ...a, ...ctx() })),
    routeLeadItemToStock: act(T.routeLeadItemToStock),
    releaseHold: act(T.releaseHold),
    createOrderCopyAndJob: act(T.createOrderCopyAndJob),
    // karigar jobs
    acceptJob: act(T.acceptJob),
    startJob: act(T.startJob),
    markJobReady: act(T.markJobReady),
    handOver: act(T.handOver),
    // parcels
    recordParcelArrival: act(T.recordParcelArrival),
    saveTag: act(T.saveTag),
    qcTick: act(T.qcTick),
    releaseParcel: act(T.releaseParcel),
    ownerSendBack: act(T.ownerSendBack),
    ownerRecheckTag: act(T.ownerRecheckTag),
    ownerAcceptLoss: act(T.ownerAcceptLoss),
    // problems
    raiseProblem: act(T.raiseProblem),
    clearProblem: act(T.clearProblem),
    // edits
    proposeEdit: act(T.proposeEdit),
    ownerAgreeEdit: act(T.ownerAgreeEdit),
    applyEdit: act(T.applyEdit),
    refuseEdit: act(T.refuseEdit),
    // stock-out and scrap
    stockOut: act(T.stockOut),
    requestScrap: act(T.requestScrap),
    ownerScrap: act(T.ownerScrap),
    ownerDeclineScrap: act(T.ownerDeclineScrap),
    // onboarding
    onboardCustomer: act(T.onboardCustomer),
    onboardKarigar: act(T.onboardKarigar),
    onboardStaff: act(T.onboardStaff),
    // marketing
    sendWishes: act(T.sendWishes),
    sendBroadcast: act(T.sendBroadcast),
    simulateReply: act(T.simulateReply),
    // scales and settings
    upsertScale: act(T.upsertScale),
    rememberScale: (scaleId: string): ActionResult => run((s) => T.rememberScale(s, { scaleId })),
    setSetting: <K extends keyof Settings>(key: K, value: Settings[K]): ActionResult =>
      run((s) => T.setSetting(s, { ...ctx(), key, value })),
  };
}

export type Actions = ReturnType<typeof buildActions>;

export interface Store {
  state: AppState;
  actions: Actions;
  /** Move to a screen. */
  go: (id: RouteId, params?: Record<string, string>) => void;
  route: Route;
  role: RoleId;
  identity: Identity;
  actor: Actor;
  identities: Identity[];
  switchIdentity: (id: string) => void;
  /** Demo-clock time, refreshed every 30 seconds and after each action. */
  now: number;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);
  const stateRef = useRef(state);
  const [identityId, setIdentityId] = useState('ST-01');
  const [route, setRoute] = useState<Route>({ id: 'today' });
  const [now, setNow] = useState(demoNow);

  const allIdentities = useMemo(() => identitiesOf(state), [state]);
  const identity = allIdentities.find((i) => i.id === identityId) ?? allIdentities[0];
  const identityRef = useRef(identity);
  identityRef.current = identity;

  useEffect(() => {
    const t = window.setInterval(() => setNow(demoNow()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const actions = useMemo(() => {
    const run = (fn: (s: AppState) => Out): ActionResult => {
      try {
        const out = fn(stateRef.current);
        let next: AppState;
        let id: string | undefined;
        if (Array.isArray(out)) {
          [next, id] = out as unknown as [AppState, string];
        } else {
          next = out as AppState;
        }
        stateRef.current = next;
        setState(next);
        setNow(demoNow());
        return { ok: true, id };
      } catch (e) {
        if (e instanceof T.DomainError) return { ok: false, error: e.message, code: 'rule_refused' };
        throw e;
      }
    };
    return buildActions(run, () => ({ by: actorOf(identityRef.current), at: demoNow() }));
  }, []);

  const go = useCallback((id: RouteId, params?: Record<string, string>) => {
    setRoute({ id, params });
    window.scrollTo({ top: 0 });
  }, []);

  const switchIdentity = useCallback(
    (id: string) => {
      const next = identitiesOf(stateRef.current).find((i) => i.id === id);
      if (!next) return;
      setIdentityId(id);
      setRoute({ id: landingRoute[next.role] });
      window.scrollTo({ top: 0 });
    },
    [],
  );

  const value = useMemo<Store>(
    () => ({
      state,
      actions,
      go,
      route,
      role: identity.role,
      identity,
      actor: actorOf(identity),
      identities: allIdentities,
      switchIdentity,
      now,
    }),
    [state, actions, go, route, identity, allIdentities, switchIdentity, now],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}
