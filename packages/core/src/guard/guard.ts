/* eslint-disable @typescript-eslint/no-explicit-any */
import { slugify } from '../internal/ids.js';
import { FlowError } from '../errors/index.js';
import type { DepKey, GuardDefinition, NamedOptions } from '../types.js';

type GuardHandlerDeps<
  TDeps,
  TDeclared extends keyof TDeps,
  TDeclaredSet extends boolean,
> = [TDeclaredSet] extends [true] ? Pick<TDeps, TDeclared> : TDeps;

/**
 * Fluent builder for a {@link guard}. Provide a `check`, then finish with
 * `denyWith(...)` (custom rejection) or `build()` (default rejection).
 */
class GuardBuilder<
  TContext,
  TDeps,
  TDeclaredDeps extends keyof TDeps = never,
  TDepsDeclared extends boolean = false,
> {
  private readonly _id: string;
  private readonly _name: string;
  private _dependsOn: string[] = [];
  private _metadata?: Record<string, unknown>;
  private _tags: string[] = [];
  private _check?: (
    ctx: TContext,
    deps: GuardHandlerDeps<TDeps, TDeclaredDeps, TDepsDeclared>,
  ) => boolean | Promise<boolean>;
  private _deny?: (
    ctx: TContext,
    deps: GuardHandlerDeps<TDeps, TDeclaredDeps, TDepsDeclared>,
  ) => void | Promise<void>;

  constructor(name: string, options?: NamedOptions) {
    this._name = name;
    this._id = options?.id ?? slugify(name);
  }

  /**
   * Declare injected dependencies the guard's `check` / `denyWith` handlers use.
   * Narrows `deps` to the declared keys (same semantics as
   * {@link OperationBuilder.dependsOn}).
   */
  dependsOn<K extends DepKey<TDeps>>(dep: K): GuardBuilder<
    TContext,
    TDeps,
    TDeclaredDeps | K,
    true
  >;
  dependsOn<K1 extends DepKey<TDeps>, K2 extends DepKey<TDeps>>(
    dep1: K1,
    dep2: K2,
  ): GuardBuilder<TContext, TDeps, TDeclaredDeps | K1 | K2, true>;
  dependsOn<
    K1 extends DepKey<TDeps>,
    K2 extends DepKey<TDeps>,
    K3 extends DepKey<TDeps>,
  >(
    dep1: K1,
    dep2: K2,
    dep3: K3,
  ): GuardBuilder<TContext, TDeps, TDeclaredDeps | K1 | K2 | K3, true>;
  dependsOn(
    ...deps: DepKey<TDeps>[]
  ): GuardBuilder<TContext, TDeps, TDeclaredDeps | DepKey<TDeps>, true> {
    this._dependsOn.push(...deps);
    return this as unknown as GuardBuilder<
      TContext,
      TDeps,
      TDeclaredDeps | DepKey<TDeps>,
      true
    >;
  }

  metadata(meta: Record<string, unknown>): this {
    this._metadata = { ...this._metadata, ...meta };
    return this;
  }

  tags(...tags: string[]): this {
    this._tags.push(...tags);
    return this;
  }

  check(
    fn: (
      ctx: TContext,
      deps: GuardHandlerDeps<TDeps, TDeclaredDeps, TDepsDeclared>,
    ) => boolean | Promise<boolean>,
  ): this {
    this._check = fn;
    return this;
  }

  denyWith(
    fn: (
      ctx: TContext,
      deps: GuardHandlerDeps<TDeps, TDeclaredDeps, TDepsDeclared>,
    ) => void | Promise<void>,
  ): GuardDefinition<TContext, TDeps> {
    this._deny = fn;
    return this.build();
  }

  build(): GuardDefinition<TContext, TDeps> {
    const check = this._check;
    if (!check) {
      throw new FlowError({
        message: `Guard "${this._name}" is missing a check() function`,
        code: 'FLOW_GUARD_INCOMPLETE',
      });
    }
    const widenedCheck = check as unknown as GuardDefinition<TContext, TDeps>['check'];
    const widenedDeny = this._deny as GuardDefinition<TContext, TDeps>['deny'];
    return {
      id: this._id,
      name: this._name,
      dependsOn: this._dependsOn,
      metadata: this._metadata,
      tags: this._tags,
      check: widenedCheck,
      deny: widenedDeny,
    };
  }
}

/**
 * Define a business condition (a gate/precondition) used with
 * {@link FlowBuilder.guard}.
 *
 * **What:** returns a {@link GuardBuilder}. Provide `.check(...)`, then finish
 * with `.denyWith(...)` for a custom rejection or `.build()` for the default.
 *
 * **When to use:** for "may we proceed?" decisions - authorization, entitlement,
 * billing/subscription status, feature availability.
 *
 * **Why:** guards make preconditions explicit and traceable (a denial yields
 * `failureKind: 'guard_denied'`), instead of `if (!allowed) throw` buried in
 * service code. They are reusable across flows.
 *
 * @typeParam TContext - the flow context the condition inspects.
 * @typeParam TDeps    - injected services available to the check.
 * @param name    - human-readable guard name (shown in traces and describe).
 * @param options - optional `{ id }` to pin a stable id (defaults to a slug).
 *
 * @example
 * const allowed = guard<Ctx>('Subscription allows usage')
 *   .check(ctx => ['active', 'trialing'].includes(ctx.subscription.status))
 *   .denyWith(() => { throw new FlowHttpError({ statusCode: 402, code: 'BILLING_INACTIVE', message: 'Billing is inactive' }); });
 */
export function guard<TContext = any, TDeps = any>(
  name: string,
  options?: NamedOptions,
): GuardBuilder<TContext, TDeps> {
  return new GuardBuilder<TContext, TDeps>(name, options);
}

export type { GuardBuilder };
