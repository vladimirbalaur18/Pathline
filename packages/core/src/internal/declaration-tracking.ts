import type { Logger } from '../types.js';

export interface TrackedDeps<TDeps> {
  readonly proxy: TDeps;
  readonly accessed: ReadonlySet<string>;
}

/** Proxy `deps` so property reads can be compared to declared keys (dev/test only). */
export function trackDepsAccess<TDeps>(deps: TDeps): TrackedDeps<TDeps> {
  const accessed = new Set<string>();
  const proxy = new Proxy(deps as object, {
    get(target, prop, receiver) {
      if (typeof prop === 'string') accessed.add(prop);
      return Reflect.get(target, prop, receiver);
    },
  }) as TDeps;
  return { proxy, accessed };
}

export interface TrackedContext<TContext> {
  readonly proxy: TContext;
  readonly accessedReads: ReadonlySet<string>;
  readonly writtenKeys: ReadonlySet<string>;
  recordPatch(patch: unknown): void;
}

/** Proxy `ctx` to observe reads/writes against declared keys (dev/test only). */
export function trackContextAccess<TContext>(
  ctx: TContext,
  trackReads: boolean,
  trackWrites: boolean,
): TrackedContext<TContext> {
  const accessedReads = new Set<string>();
  const writtenKeys = new Set<string>();

  if (!trackReads && !trackWrites) {
    return {
      proxy: ctx,
      accessedReads,
      writtenKeys,
      recordPatch(patch) {
        if (trackWrites && patch && typeof patch === 'object') {
          for (const key of Object.keys(patch as object)) writtenKeys.add(key);
        }
      },
    };
  }

  const proxy = new Proxy(ctx as object, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && trackReads) accessedReads.add(prop);
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value, receiver) {
      if (typeof prop === 'string' && trackWrites) writtenKeys.add(prop);
      return Reflect.set(target, prop, value, receiver);
    },
  }) as TContext;

  return {
    proxy,
    accessedReads,
    writtenKeys,
    recordPatch(patch) {
      if (trackWrites && patch && typeof patch === 'object') {
        for (const key of Object.keys(patch as object)) writtenKeys.add(key);
      }
    },
  };
}

function diffDeclared(
  declared: readonly string[],
  used: ReadonlySet<string>,
): { unused: string[]; undeclared: string[] } {
  const declaredSet = new Set(declared);
  const unused = declared.filter((key) => !used.has(key));
  const undeclared = [...used].filter((key) => !declaredSet.has(key));
  return { unused, undeclared };
}

export function warnDeclarationMismatches(
  logger: Logger | undefined,
  operation: string,
  declared: readonly string[],
  used: ReadonlySet<string>,
  codes: { unused: string; undeclared: string },
  label: string,
): void {
  if (!logger?.warn || declared.length === 0) return;
  const { unused, undeclared } = diffDeclared(declared, used);
  if (unused.length > 0) {
    logger.warn(
      `Operation "${operation}" declares unused ${label}: ${unused.join(', ')}`,
      { code: codes.unused, operation, unused },
    );
  }
  if (undeclared.length > 0) {
    logger.warn(
      `Operation "${operation}" uses undeclared ${label}: ${undeclared.join(', ')}`,
      { code: codes.undeclared, operation, undeclared },
    );
  }
}
