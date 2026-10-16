import { PhaseClock, stampArrival } from '../acceptTiming';
import type { NextFunction, Request, Response } from 'express';

/** Run 8 (box 62242): the accept says where its time went, phase by phase. */
describe('the accept times itself', () => {
  it('stamps when the process first saw the request', () => {
    const res = { locals: {} } as unknown as Response;
    const next = jest.fn() as NextFunction;
    stampArrival({} as Request, res, next);
    expect(typeof res.locals.arrivedAt).toBe('number');
    expect(next).toHaveBeenCalled();
  });

  it('reads each phase as the time since the one before, and the total from arrival', () => {
    const clock = new PhaseClock(100);
    clock.mark('thread', 150);
    clock.mark('payer', 400);
    // before_handler is measured from 100 to the real clock, so only the named phases are exact.
    const line = clock.line(1_100);
    expect(line).toContain('thread ');
    expect(line).toContain('payer 250ms');
    expect(line).toMatch(/total 1000ms$/);
  });

  it('starts from now when nothing stamped the arrival', () => {
    const clock = new PhaseClock(undefined);
    expect(clock.line()).toMatch(/^before_handler 0ms, total \d+ms$/);
  });
});
