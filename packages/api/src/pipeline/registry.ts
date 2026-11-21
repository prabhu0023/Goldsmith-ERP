/**
 * Operation registry (EP-03-S1 rule). Each service function is registered under a contract
 * operation name; a handler for a name the contract does not declare stops the app at startup.
 */
import type { Actor, Contract, OperationDef } from '@goldsmith/shared';
import type { z } from 'zod';
import type { ShopContext } from '../db/shop-context.js';
import type { Tx } from './operation-transaction.js';

/** What every service function receives besides its input. Set by the server, never the client. */
export interface OperationCtx {
  /** The signed-in user (id = users.id). */
  by: Actor;
  /** The server clock's time (UTC). */
  at: Date;
  shop: ShopContext;
}

export type Handler<Op extends OperationDef> = (
  tx: Tx,
  ctx: OperationCtx,
  input: z.output<Op['input']>,
) => Promise<z.output<Op['result']>>;

/** Any handler, whatever its input; the registry only calls it with input its schema produced. */
export type AnyHandler = (tx: Tx, ctx: OperationCtx, input: never) => Promise<unknown>;

/** Handlers for some or all of a contract's operations. */
export type Handlers<C extends Contract> = { [K in keyof C]?: Handler<C[K]> };

export type HandlerMap = Readonly<Record<string, AnyHandler | undefined>>;

export interface RegisteredOperation {
  def: OperationDef;
  run: (tx: Tx, ctx: OperationCtx, input: unknown) => Promise<unknown>;
}

export interface OperationRegistry {
  /** The declared and implemented operation with this name, if any. */
  get(name: string): RegisteredOperation | undefined;
}

export function createOperationRegistry(contract: Contract, handlers: HandlerMap): OperationRegistry {
  const operations = new Map<string, RegisteredOperation>();
  for (const [name, handler] of Object.entries(handlers)) {
    if (!handler) continue;
    if (!Object.hasOwn(contract, name)) throw new Error(`Operation ${name} is not declared in the contract`);
    operations.set(name, {
      def: contract[name],
      run: handler as (tx: Tx, ctx: OperationCtx, input: unknown) => Promise<unknown>,
    });
  }
  return { get: (name) => operations.get(name) };
}
