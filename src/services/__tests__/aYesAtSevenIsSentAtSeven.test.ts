import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { WakeOrigin, wakeWaitsForMorning } from '../quietWakeGuard';

/**
 * Tornike's 8 Nov report, #1: an owner said „კი" at 07:20 Tbilisi, the plan was
 * approved, and nobody it named was ever written to. Day one ran as Netai's own
 * wake, so the quiet hours held it, and the morning tick that should have
 * brought it back sat behind the whole wake queue. Day one follows the owner's
 * own yes: it is his wake, and it is not held.
 */
const ENGINE = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');
const SEVEN_TWENTY_TBILISI = new Date('2026-11-08T03:20:00Z');

describe('day one after the owner’s yes in the quiet hours', () => {
  it('is not held for the morning, because the owner caused it', async () => {
    await expect(wakeWaitsForMorning('5', WakeOrigin.Owner, SEVEN_TWENTY_TBILISI)).resolves.toBe(
      false,
    );
  });

  it('is started as the owner’s wake', () => {
    const dayOne = ENGINE.slice(
      ENGINE.indexOf('export function startDayOne('),
      ENGINE.indexOf('\n}\n', ENGINE.indexOf('export function startDayOne(')),
    );
    expect(dayOne).toMatch(
      /\(\) => finishWake\(taskId, DAY_ONE_WAKE\),[\s\S]*WakeOrigin\.Owner,\s*\);$/,
    );
  });

  it('carries that origin into the run and through every retry', () => {
    expect(ENGINE).toContain(
      'const woken = await wakeTask(taskId, text, undefined, origin, carriesAnswer);',
    );
    expect(ENGINE).toMatch(/attempt \+ 1,\s+onGaveUp,\s+origin,/);
  });
});

describe('a day one that was lost can be run again by hand', () => {
  const ADMIN = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
    'utf8',
  );
  const route = ADMIN.slice(ADMIN.indexOf("'/tasks/:id/day-one'"));

  it('only on an open, approved goal', () => {
    expect(route).toContain("if (task.status !== 'open' || task.plan_approved_at === null) {");
    expect(route).toContain('res.status(409)');
  });

  it('through day one itself, with its own checks, at once', () => {
    expect(route.indexOf('startDayOne(task.id, 0);')).toBeGreaterThan(
      route.indexOf('task.plan_approved_at === null'),
    );
  });
});
