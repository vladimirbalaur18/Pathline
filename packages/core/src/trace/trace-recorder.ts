import type { FlowTraceEvent, TraceOptions } from '../types.js';

/** Collects trace events during a run, applying size limits and onTrace. */
export class TraceRecorder {
  private readonly events: FlowTraceEvent[] = [];
  private readonly maxEvents?: number;
  readonly repeatMode: 'summary' | 'full';
  private dropped = 0;

  constructor(
    private readonly flowName: string,
    private readonly runId: string,
    private readonly onTrace?: (e: FlowTraceEvent) => void | Promise<void>,
    options?: TraceOptions,
  ) {
    this.maxEvents = options?.maxEvents;
    this.repeatMode = options?.repeatMode ?? 'summary';
  }

  emit(event: Omit<FlowTraceEvent, 'flowName' | 'runId'>): FlowTraceEvent {
    const full: FlowTraceEvent = {
      ...event,
      flowName: this.flowName,
      runId: this.runId,
    };
    if (this.maxEvents === undefined || this.events.length < this.maxEvents) {
      this.events.push(full);
    } else {
      this.dropped++;
    }
    if (this.onTrace) {
      void this.onTrace(full);
    }
    return full;
  }

  getEvents(): FlowTraceEvent[] {
    return this.events;
  }

  get droppedCount(): number {
    return this.dropped;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
