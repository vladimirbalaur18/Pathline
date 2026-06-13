/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  FlowCancelledError,
  FlowError,
  FlowHttpError,
  FlowTimeoutError,
  serializeError,
} from '../errors/index.js';
import { applyPatch } from '../operation/operation.js';
import { generateRunId } from '../internal/ids.js';
import {
  trackContextAccess,
  trackDepsAccess,
  warnDeclarationMismatches,
} from '../internal/declaration-tracking.js';
import { TraceRecorder, nowIso } from '../trace/trace-recorder.js';
import type {
  FlowDefinition,
  FlowFailureKind,
  FlowRunOptions,
  FlowRunResult,
  GuardDefinition,
  OperationDefinition,
  OperationLifecycleEvent,
  OperationStatus,
  ParallelDefinition,
  RepeatDefinition,
  RuntimeApi,
  SerializedFlowError,
  Step,
} from '../types.js';

const DEFAULT_MAX_STEPS = 10_000;

type Control =
  | { type: 'goto'; stageName: string }
  | { type: 'continueRepeat' }
  | { type: 'stopRepeat' };

interface ExecState<TContext, TDeps> {
  definition: FlowDefinition<TContext, any, TDeps>;
  deps: TDeps;
  ctx: TContext;
  runId: string;
  signal?: AbortSignal;
  hooks?: FlowRunOptions<TContext>['hooks'];
  logger?: FlowRunOptions<TContext>['logger'];
  trace: TraceRecorder;
  stepCount: number;
  maxSteps: number;
  silentDepth: number;
  pendingFailureKind?: FlowFailureKind;
}

const isProduction = (): boolean =>
  typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';

export interface RunMeta {
  definitionHash: string;
}

/** Execute a flow definition and produce a structured result + trace. */
export async function runFlow<TContext, TOutput, TDeps>(
  definition: FlowDefinition<TContext, TOutput, TDeps>,
  initialContext: Partial<TContext>,
  deps: TDeps,
  meta: RunMeta,
  options: FlowRunOptions<TContext> = {},
): Promise<FlowRunResult<TOutput>> {
  const runId = generateRunId();
  const startedAt = Date.now();
  const trace = new TraceRecorder(
    definition.name,
    runId,
    options.onTrace,
    options.trace,
  );

  const exec: ExecState<TContext, TDeps> = {
    definition: definition as FlowDefinition<TContext, any, TDeps>,
    deps,
    ctx: (initialContext ?? {}) as TContext,
    runId,
    signal: options.signal,
    hooks: options.hooks,
    logger: options.logger,
    trace,
    stepCount: 0,
    maxSteps: options.maxSteps ?? DEFAULT_MAX_STEPS,
    silentDepth: 0,
  };

  let ok = false;
  let output: TOutput | undefined;
  let error: SerializedFlowError | undefined;
  let failureKind: FlowFailureKind | undefined;
  const compensationErrors: SerializedFlowError[] = [];
  const finallyErrors: SerializedFlowError[] = [];

  trace.emit({ kind: 'flow', status: 'started', startedAt: nowIso() });

  try {
    await callHook(exec, 'beforeFlow', exec.ctx);
    await callHook(exec, 'onFlowStart', exec.ctx);

    await runStages(exec);

    if (definition.output) {
      trace.emit({ kind: 'output', status: 'started' });
      output = await definition.output(exec.ctx);
      trace.emit({ kind: 'output', status: 'completed' });
    }

    await runCleanup(exec, finallyErrors);

    if (finallyErrors.length > 0) {
      ok = false;
      failureKind = 'finally_failed';
      error = finallyErrors[0];
    } else {
      ok = true;
    }
  } catch (err) {
    ok = false;
    failureKind = classifyError(err, exec);
    error = serializeError(err, failureKind);

    await runCompensation(exec, compensationErrors);
    await runCleanup(exec, finallyErrors);
  }

  const result: FlowRunResult<TOutput> = {
    ok,
    output,
    error,
    failureKind,
    trace: trace.getEvents(),
    compensationErrors: compensationErrors.length ? compensationErrors : undefined,
    finallyErrors: finallyErrors.length ? finallyErrors : undefined,
    durationMs: Date.now() - startedAt,
    flowName: definition.name,
    flowVersion: definition.version,
    definitionHash: meta.definitionHash,
    runId,
  };

  trace.emit({
    kind: 'flow',
    status: ok ? 'completed' : 'failed',
    endedAt: nowIso(),
    error,
  });

  await callHook(exec, ok ? 'onFlowComplete' : 'onFlowFail', exec.ctx, result);
  await callHook(exec, 'afterFlow', exec.ctx, result);

  return result;
}

async function runStages<TContext, TDeps>(
  exec: ExecState<TContext, TDeps>,
): Promise<void> {
  const stages = exec.definition.stages;
  const indexByName = new Map<string, number>();
  stages.forEach((s, i) => indexByName.set(s.name, i));

  let stageIndex = 0;
  while (stageIndex < stages.length) {
    const stage = stages[stageIndex]!;
    throwIfAborted(exec);
    exec.trace.emit({ kind: 'stage', status: 'started', stageName: stage.name });

    const control = await runSteps(exec, stage.steps, stage.name);

    exec.trace.emit({ kind: 'stage', status: 'completed', stageName: stage.name });

    if (control?.type === 'goto') {
      const next = indexByName.get(control.stageName);
      if (next === undefined) {
        exec.pendingFailureKind = 'internal_error';
        throw new FlowError({
          message: `goTo target stage "${control.stageName}" does not exist`,
          code: 'FLOW_GOTO_TARGET_MISSING',
        });
      }
      stageIndex = next;
      continue;
    }
    stageIndex++;
  }
}

async function runSteps<TContext, TDeps>(
  exec: ExecState<TContext, TDeps>,
  steps: Step<TContext, TDeps>[],
  stageName: string,
): Promise<Control | undefined> {
  for (const step of steps) {
    const control = await runStep(exec, step, stageName);
    if (control) return control;
  }
  return undefined;
}

async function runStep<TContext, TDeps>(
  exec: ExecState<TContext, TDeps>,
  step: Step<TContext, TDeps>,
  stageName: string,
): Promise<Control | undefined> {
  tick(exec);
  throwIfAborted(exec);

  switch (step.kind) {
    case 'operation':
      await runLeaf(exec, step.operation, 'operation', stageName);
      return undefined;

    case 'guard':
      await runGuard(exec, step.guard, stageName);
      return undefined;

    case 'goto':
      return { type: 'goto', stageName: step.stageName };

    case 'fail':
      exec.pendingFailureKind = 'operation_failed';
      throw toFlowError(step.error);

    case 'branch':
      return runBranch(exec, step.branch, stageName);

    case 'parallel':
      await runParallel(exec, step.parallel, stageName);
      return undefined;

    case 'repeat':
      return runRepeat(exec, step.repeat, stageName);

    case 'subflow': {
      const subResult = await step.subflow.flow.run(exec.ctx as any, {
        signal: exec.signal,
      });
      if (!subResult.ok) {
        exec.pendingFailureKind = 'operation_failed';
        throw new FlowError({
          message: `Subflow "${step.subflow.name}" failed: ${subResult.error?.message ?? 'unknown error'}`,
          code: 'FLOW_SUBFLOW_FAILED',
          details: subResult.error,
        });
      }
      if (step.subflow.mapOutput) {
        applyPatch(exec.ctx, step.subflow.mapOutput(exec.ctx, subResult.output));
      }
      return undefined;
    }

    default:
      return undefined;
  }
}

async function runBranch<TContext, TDeps>(
  exec: ExecState<TContext, TDeps>,
  branch: { id: string; name: string; cases: any[] },
  stageName: string,
): Promise<Control | undefined> {
  for (const c of branch.cases) {
    const matches = c.predicate === undefined || c.predicate(exec.ctx);
    if (!matches) continue;

    emit(exec, {
      kind: 'branch',
      status: 'selected',
      stageName,
      message: branch.name,
      selectedBranch: c.name,
    });

    const action = c.action;
    switch (action.kind) {
      case 'goto':
        return { type: 'goto', stageName: action.stageName };
      case 'continueRepeat':
        return { type: 'continueRepeat' };
      case 'stopRepeat':
        return { type: 'stopRepeat' };
      case 'fail':
        exec.pendingFailureKind = 'operation_failed';
        throw toFlowError(action.error);
      case 'do':
        await runLeaf(exec, action.operation, 'operation', stageName);
        return undefined;
      default:
        return undefined;
    }
  }

  exec.pendingFailureKind = 'branch_unmatched';
  throw new FlowError({
    message: `Branch "${branch.name}" matched no case and has no otherwise()`,
    code: 'FLOW_BRANCH_UNMATCHED',
  });
}

async function runParallel<TContext, TDeps>(
  exec: ExecState<TContext, TDeps>,
  parallel: ParallelDefinition<TContext, TDeps>,
  stageName: string,
): Promise<void> {
  emit(exec, { kind: 'parallel', status: 'started', stageName, message: parallel.name });

  const ops = parallel.operations;
  const limit = parallel.concurrency;

  if (parallel.mode === 'collectAll') {
    const errors: unknown[] = [];
    await runPool(ops, limit, async (op) => {
      try {
        await runLeaf(exec, op, 'operation', stageName);
      } catch (e) {
        errors.push(e);
      }
    });
    if (errors.length > 0) {
      emit(exec, { kind: 'parallel', status: 'failed', stageName, message: parallel.name });
      exec.pendingFailureKind = 'operation_failed';
      throw new FlowError({
        message: `Parallel "${parallel.name}" had ${errors.length} failure(s)`,
        code: 'FLOW_PARALLEL_FAILED',
        details: errors.map((e) => serializeError(e)),
      });
    }
  } else {
    try {
      await runPool(ops, limit, (op) => runLeaf(exec, op, 'operation', stageName));
    } catch (e) {
      emit(exec, { kind: 'parallel', status: 'failed', stageName, message: parallel.name });
      throw e;
    }
  }

  emit(exec, { kind: 'parallel', status: 'completed', stageName, message: parallel.name });
}

async function runRepeat<TContext, TDeps>(
  exec: ExecState<TContext, TDeps>,
  repeat: RepeatDefinition<TContext, TDeps>,
  stageName: string,
): Promise<Control | undefined> {
  const summary = exec.trace.repeatMode === 'summary';
  emit(exec, { kind: 'repeat', status: 'started', stageName, message: repeat.name });

  const start = Date.now();
  let attempt = 0;
  let control: Control | undefined;

  if (summary) exec.silentDepth++;
  try {
    for (;;) {
      if (repeat.maxAttempts !== undefined && attempt >= repeat.maxAttempts) break;
      if (
        repeat.timeBudgetMs !== undefined &&
        Date.now() - start >= repeat.timeBudgetMs
      ) {
        break;
      }
      const stop = repeat.stopConditions.find((c) => c.predicate(exec.ctx));
      if (stop) break;

      attempt++;
      tick(exec);
      throwIfAborted(exec);

      const bodyControl = await runSteps(exec, repeat.body, stageName);
      if (bodyControl?.type === 'continueRepeat') continue;
      if (bodyControl?.type === 'stopRepeat') break;
      if (bodyControl?.type === 'goto') {
        control = bodyControl;
        break;
      }
    }
  } finally {
    if (summary) exec.silentDepth--;
  }

  emit(exec, {
    kind: 'repeat',
    status: 'completed',
    stageName,
    message: repeat.name,
    attempts: attempt,
    childrenPolicy: summary ? 'summary' : 'full',
  });

  return control;
}

async function runLeaf<TContext, TDeps>(
  exec: ExecState<TContext, TDeps>,
  op: OperationDefinition<TContext, TDeps>,
  kind: 'operation' | 'compensation' | 'finally',
  stageName?: string,
): Promise<void> {
  const startedAt = nowIso();
  const start = Date.now();

  await callOpHook(exec, 'beforeOperation', op, 'started', stageName);
  await callOpHook(exec, 'onOperationStart', op, 'started', stageName);
  emit(exec, { kind, status: 'started', stageName, operationName: op.name, nodeId: op.id });

  const policy = op.retry;
  const maxAttempts = policy?.attempts ?? 1;
  let lastError: unknown;

  // In dev/test, track declared deps/reads/writes against actual handler usage.
  const devTracking = !isProduction();
  const trackDeps =
    devTracking &&
    op.dependsOn.length > 0 &&
    exec.deps != null &&
    typeof exec.deps === 'object';
  const trackReads = devTracking && op.reads.length > 0;
  const trackWrites = devTracking && op.writes.length > 0;

  const depsTracked = trackDeps ? trackDepsAccess(exec.deps) : undefined;
  const ctxTracked =
    trackReads || trackWrites
      ? trackContextAccess(exec.ctx, trackReads, trackWrites)
      : undefined;
  const depsForHandler = depsTracked?.proxy ?? exec.deps;
  const ctxForHandler = ctxTracked?.proxy ?? exec.ctx;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      throwIfAborted(exec);
      const runtime: RuntimeApi = { signal: exec.signal, runId: exec.runId };
      const patch = await withTimeoutAndSignal(
        () => op.handler(ctxForHandler, depsForHandler, runtime),
        op.timeoutMs,
        exec.signal,
        op.name,
      );
      ctxTracked?.recordPatch(patch);
      applyPatch(exec.ctx, patch);

      if (depsTracked) {
        warnDeclarationMismatches(
          exec.logger,
          op.name,
          op.dependsOn,
          depsTracked.accessed,
          {
            unused: 'UNUSED_FLOW_DEPENDENCY',
            undeclared: 'UNDECLARED_FLOW_DEPENDENCY',
          },
          'dependencies',
        );
      }
      if (ctxTracked && trackReads) {
        warnDeclarationMismatches(
          exec.logger,
          op.name,
          op.reads,
          ctxTracked.accessedReads,
          {
            unused: 'UNUSED_CONTEXT_READ',
            undeclared: 'UNDECLARED_CONTEXT_READ',
          },
          'context reads',
        );
      }
      if (ctxTracked && trackWrites) {
        warnDeclarationMismatches(
          exec.logger,
          op.name,
          op.writes,
          ctxTracked.writtenKeys,
          {
            unused: 'UNUSED_CONTEXT_WRITE',
            undeclared: 'UNDECLARED_CONTEXT_WRITE',
          },
          'context writes',
        );
      }

      emit(exec, {
        kind,
        status: 'completed',
        stageName,
        operationName: op.name,
        nodeId: op.id,
        startedAt,
        endedAt: nowIso(),
        durationMs: Date.now() - start,
        attempt,
      });
      await callOpHook(exec, 'afterOperation', op, 'completed', stageName, attempt);
      await callOpHook(exec, 'onOperationComplete', op, 'completed', stageName, attempt);
      return;
    } catch (err) {
      lastError = err;
      const retryable =
        attempt < maxAttempts &&
        !(err instanceof FlowCancelledError) &&
        (policy?.retryOn ? policy.retryOn(err) : true);
      if (!retryable) break;
      emit(exec, {
        kind,
        status: 'failed',
        stageName,
        operationName: op.name,
        nodeId: op.id,
        attempt,
        message: 'retrying',
        error: serializeError(err),
      });
      await delayBackoff(policy, attempt, exec.signal);
    }
  }

  emit(exec, {
    kind,
    status: 'failed',
    stageName,
    operationName: op.name,
    nodeId: op.id,
    endedAt: nowIso(),
    durationMs: Date.now() - start,
    error: serializeError(lastError),
  });
  await callOpHook(exec, 'afterOperation', op, 'failed', stageName, undefined, lastError);
  await callOpHook(exec, 'onOperationFail', op, 'failed', stageName, undefined, lastError);
  throw lastError;
}

async function runGuard<TContext, TDeps>(
  exec: ExecState<TContext, TDeps>,
  guard: GuardDefinition<TContext, TDeps>,
  stageName: string,
): Promise<void> {
  emit(exec, { kind: 'guard', status: 'started', stageName, operationName: guard.name, nodeId: guard.id });

  const trackDeps =
    !isProduction() &&
    guard.dependsOn.length > 0 &&
    exec.deps != null &&
    typeof exec.deps === 'object';
  const depsTracked = trackDeps ? trackDepsAccess(exec.deps) : undefined;
  const depsForHandler = depsTracked?.proxy ?? exec.deps;

  const passed = await guard.check(exec.ctx, depsForHandler);
  if (passed) {
    if (depsTracked) {
      warnDeclarationMismatches(
        exec.logger,
        guard.name,
        guard.dependsOn,
        depsTracked.accessed,
        {
          unused: 'UNUSED_GUARD_DEPENDENCY',
          undeclared: 'UNDECLARED_GUARD_DEPENDENCY',
        },
        'dependencies',
      );
    }
    emit(exec, { kind: 'guard', status: 'completed', stageName, operationName: guard.name, nodeId: guard.id });
    return;
  }

  exec.pendingFailureKind = 'guard_denied';
  emit(exec, { kind: 'guard', status: 'failed', stageName, operationName: guard.name, nodeId: guard.id });
  if (guard.deny) {
    await guard.deny(exec.ctx, depsForHandler);
  }
  throw new FlowHttpError({
    statusCode: 403,
    code: 'GUARD_DENIED',
    message: `Guard "${guard.name}" denied execution`,
  });
}

async function runCompensation<TContext, TDeps>(
  exec: ExecState<TContext, TDeps>,
  errors: SerializedFlowError[],
): Promise<void> {
  for (const op of exec.definition.onFailure) {
    try {
      await runLeaf(exec, op, 'compensation');
    } catch (err) {
      errors.push(serializeError(err, 'compensation_failed'));
    }
  }
}

async function runCleanup<TContext, TDeps>(
  exec: ExecState<TContext, TDeps>,
  errors: SerializedFlowError[],
): Promise<void> {
  for (const op of exec.definition.finally) {
    try {
      await runLeaf(exec, op, 'finally');
    } catch (err) {
      errors.push(serializeError(err, 'finally_failed'));
    }
  }
}

/* -------------------------- helpers -------------------------- */

function emit<TContext, TDeps>(
  exec: ExecState<TContext, TDeps>,
  event: Parameters<TraceRecorder['emit']>[0],
): void {
  if (exec.silentDepth > 0) return;
  exec.trace.emit(event);
}

function tick<TContext, TDeps>(exec: ExecState<TContext, TDeps>): void {
  exec.stepCount++;
  if (exec.stepCount > exec.maxSteps) {
    exec.pendingFailureKind = 'max_steps_exceeded';
    throw new FlowError({
      message: `Flow exceeded maxSteps (${exec.maxSteps})`,
      code: 'FLOW_MAX_STEPS_EXCEEDED',
    });
  }
}

function throwIfAborted<TContext, TDeps>(exec: ExecState<TContext, TDeps>): void {
  if (exec.signal?.aborted) {
    exec.pendingFailureKind = 'cancelled';
    throw new FlowCancelledError();
  }
}

function classifyError(err: unknown, exec: ExecState<any, any>): FlowFailureKind {
  if (err instanceof FlowTimeoutError) return 'timeout';
  if (err instanceof FlowCancelledError) return 'cancelled';
  return exec.pendingFailureKind ?? 'operation_failed';
}

function toFlowError(input: {
  statusCode?: number;
  code?: string;
  message: string;
  details?: unknown;
}): FlowError {
  if (input.statusCode !== undefined) {
    return new FlowHttpError({
      statusCode: input.statusCode,
      code: input.code ?? 'FLOW_FAILED',
      message: input.message,
      details: input.details,
    });
  }
  return new FlowError({ message: input.message, code: input.code, details: input.details });
}

async function withTimeoutAndSignal<T>(
  fn: () => Promise<T> | T,
  timeoutMs: number | undefined,
  signal: AbortSignal | undefined,
  opName: string,
): Promise<T> {
  if (timeoutMs === undefined && !signal) {
    return await fn();
  }

  return await new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new FlowCancelledError());
    };

    const cleanup = (): void => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };

    if (timeoutMs !== undefined) {
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new FlowTimeoutError(opName, timeoutMs));
      }, timeoutMs);
    }

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    Promise.resolve()
      .then(fn)
      .then((value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      });
  });
}

async function delayBackoff(
  policy: { backoff?: string; delayMs?: number } | undefined,
  attempt: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  const base = policy?.delayMs ?? 50;
  let ms = base;
  if (policy?.backoff === 'exponential') ms = base * 2 ** (attempt - 1);
  else if (policy?.backoff === 'fixed') ms = base;
  else if (policy?.backoff === 'none' || policy?.backoff === undefined) ms = 0;
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new FlowCancelledError());
        },
        { once: true },
      );
    }
  });
}

async function runPool<T>(
  items: T[],
  limit: number | undefined,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (!limit || limit >= items.length) {
    await Promise.all(items.map(worker));
    return;
  }
  let index = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (index < items.length) {
      const current = index++;
      await worker(items[current]!);
    }
  });
  await Promise.all(runners);
}

async function callHook<TContext, TDeps>(
  exec: ExecState<TContext, TDeps>,
  name: 'beforeFlow' | 'afterFlow' | 'onFlowStart' | 'onFlowComplete' | 'onFlowFail',
  ctx: TContext,
  result?: FlowRunResult<unknown>,
): Promise<void> {
  const hook = exec.hooks?.[name] as any;
  if (!hook) return;
  await hook(ctx, result);
}

async function callOpHook<TContext, TDeps>(
  exec: ExecState<TContext, TDeps>,
  name:
    | 'beforeOperation'
    | 'afterOperation'
    | 'onOperationStart'
    | 'onOperationComplete'
    | 'onOperationFail',
  op: OperationDefinition<TContext, TDeps>,
  status: OperationStatus,
  stageName?: string,
  attempt?: number,
  error?: unknown,
): Promise<void> {
  const hook = exec.hooks?.[name];
  if (!hook) return;
  const event: OperationLifecycleEvent<TContext> = {
    flowName: exec.definition.name,
    runId: exec.runId,
    stageName,
    operationName: op.name,
    nodeId: op.id,
    status,
    attempt,
    error,
    ctx: exec.ctx,
  };
  await hook(event);
}
