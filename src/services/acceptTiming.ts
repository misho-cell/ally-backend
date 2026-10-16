import { performance } from 'perf_hooks';
import type { NextFunction, Request, Response } from 'express';

/**
 * Run 8 (16 Oct, 200 hellos and nothing else, box 62242): accepting a message
 * took 5.6 s for 100 at once against 1.4 s alone, and the answer — the server's
 * own greeting, no model — 2.5–3.8 s against 0.5. The logs cannot say where: the
 * host stamps them in batches (all 200 arrivals carry the same millisecond). So
 * the accept measures itself, phase by phase, from the moment the request
 * reached this process.
 */
const ARRIVED_AT = 'arrivedAt';

/** First middleware: when this process first saw the request. */
export function stampArrival(_req: Request, res: Response, next: NextFunction): void {
  res.locals[ARRIVED_AT] = performance.now();
  next();
}

/** The phases of one accept, each the time since the previous mark. */
export class PhaseClock {
  private readonly marks: [string, number][] = [];
  private last: number;
  private readonly start: number;

  constructor(arrivedAt: unknown) {
    const now = performance.now();
    this.start = typeof arrivedAt === 'number' ? arrivedAt : now;
    this.last = this.start;
    this.mark('before_handler', now);
  }

  mark(phase: string, at: number = performance.now()): void {
    this.marks.push([phase, Math.round(at - this.last)]);
    this.last = at;
  }

  /** „before_handler 12ms, thread 40ms, …, total 900ms" */
  line(at: number = performance.now()): string {
    const parts = this.marks.map(([phase, ms]) => `${phase} ${ms}ms`);
    return `${parts.join(', ')}, total ${Math.round(at - this.start)}ms`;
  }
}
