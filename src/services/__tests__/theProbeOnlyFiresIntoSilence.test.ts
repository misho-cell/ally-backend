const dbQuery = jest.fn();
const messagesCreate = jest.fn();
const recordUsage = jest.fn();

jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...args: unknown[]) => dbQuery(...args),
}));
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: (...args: unknown[]) => messagesCreate(...args) } },
}));
jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordClaudeUsage: (...args: unknown[]) => recordUsage(...args),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { beatOnce } from '../heartbeat.cron';

/**
 * THE HEARTBEAT — the first thing in this repo that SPENDS MONEY on its own,
 * every ten minutes, forever. Three properties have to hold, and each one has
 * a way of going wrong that is invisible from the outside.
 *
 *   1. IT MUST NOT SPEND WHEN IT IS NOT NEEDED. The probe exists to fill the
 *      gaps the crons leave. A version that fires whatever the ledger says
 *      would cost the same on a busy day as on an empty night and prove
 *      nothing the traffic had not already proved. The cost case for it —
 *      0.009 USD a month — was computed on „only into silence".
 *
 *   2. IT MUST NEVER COUNT AS THE PRODUCT ANSWERING. `outage.sh`'s OK line
 *      reads „N Anthropic calls" as people being served. A heartbeat proves
 *      the PROVIDER answers and nothing else — a product that is completely
 *      broken still has one. If it landed in that count, this probe would
 *      build a new blindness in the act of closing an old one, and the
 *      blindness would be worse than the one it replaced: today's „NOTHING
 *      PROVEN" is a shrug, and „OK" is a claim.
 *
 *   3. IT MUST NOT THROW. It runs inside a `setInterval` in the web process. A
 *      failing probe is the signal, not a crash — and a crash in the probe
 *      would take out the thing watching for the outage during the outage.
 *
 * None of the three is visible from the console line it prints. So they are
 * pinned here, including the two the script depends on by reading the source.
 */
beforeEach(() => {
  jest.clearAllMocks();
  messagesCreate.mockResolvedValue({ usage: { input_tokens: 12, output_tokens: 1 } });
  recordUsage.mockResolvedValue(undefined);
});

/** The ledger's answer to „how long has the provider been quiet". */
function quietFor(minutes: number | null): void {
  dbQuery.mockResolvedValue({ rows: [{ quiet_min: minutes }], rowCount: 1 });
}

describe('it only fires into silence', () => {
  it('spends nothing when a real call went through recently', async () => {
    quietFor(3);

    await expect(beatOnce()).resolves.toBe('not_needed');
    expect(messagesCreate).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });

  /**
   * THE BOUNDARY IS A REAL DECISION AND NOT A ROUNDING. Twenty-five minutes
   * sits above the gap between two ordinary runs and below `outage.sh`'s
   * night threshold, so the monitor never asks about a silence the probe has
   * not already had a chance to break.
   */
  it('still spends nothing one minute short of the threshold', async () => {
    quietFor(24);

    await expect(beatOnce()).resolves.toBe('not_needed');
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it('calls once, and asks for one token', async () => {
    quietFor(25);

    await expect(beatOnce()).resolves.toBe('sent');
    expect(messagesCreate).toHaveBeenCalledTimes(1);
    const [body, options] = messagesCreate.mock.calls[0] as [
      { max_tokens: number; model: string },
      { timeout: number },
    ];
    expect(body.max_tokens).toBe(1);
    expect(body.model).toMatch(/^claude/);
    // A probe that hangs is not a probe: without this it can sit past the next
    // sweep and the next, and the silence it was sent to break goes on.
    expect(options.timeout).toBeGreaterThan(0);
  });

  /**
   * A LEDGER THAT WILL NOT ANSWER IS NOT A REASON TO SPEND. „I could not look"
   * has its own verdict in this codebase and it is never „nothing is wrong" —
   * but it is not „buy a token" either. The monitor's CANNOT TELL is the
   * honest answer there, and it is free.
   */
  it('spends nothing when the ledger cannot be read', async () => {
    dbQuery.mockRejectedValue(new Error('read-only window is down'));

    await expect(beatOnce()).resolves.toBe('not_needed');
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it('spends nothing when the ledger holds no Anthropic call at all', async () => {
    quietFor(null);

    await expect(beatOnce()).resolves.toBe('not_needed');
    expect(messagesCreate).not.toHaveBeenCalled();
  });
});

describe('it can never be mistaken for the product answering somebody', () => {
  it('records its own kind, and no user', async () => {
    quietFor(40);

    await beatOnce();

    expect(recordUsage).toHaveBeenCalledTimes(1);
    const event = recordUsage.mock.calls[0][0] as { kind: string; userId: string | null };
    expect(event.kind).toBe('heartbeat');
    expect(event.userId).toBeNull();
  });

  /**
   * AND THE SCRIPT SAYS SO OUT LOUD RATHER THAN RELYING ON `userId IS NOT
   * NULL`. That clause does exclude the probe today — it is there for the
   * nightly enrichment job, which also carries no user — so the protection
   * would hold by accident. A protection that holds by accident is one
   * relaxation away from gone, and the relaxation would be made by somebody
   * who had never heard of this probe.
   */
  it('outage.sh excludes it from the answered-calls count, by name', () => {
    const script = readFileSync(
      join(__dirname, '..', '..', '..', 'scripts', 'ops', 'outage.sh'),
      'utf8',
    );
    const at = script.indexOf('AS anthropic_calls');

    expect(at).toBeGreaterThan(-1);
    expect(script.slice(0, at)).toContain("kind <> 'heartbeat'");
  });

  /**
   * AND THE SILENCE TEST MUST *NOT* EXCLUDE IT — the opposite rule, four
   * hundred lines apart in the same file. The whole point of the probe is that
   * silence there stops meaning „nobody is awake" and starts meaning „the
   * provider is unreachable". Filtering it out of both counts would leave the
   * night exactly as blind as before, at a cost.
   */
  it('but the night-silence test counts it', () => {
    const script = readFileSync(
      join(__dirname, '..', '..', '..', 'scripts', 'ops', 'outage.sh'),
      'utf8',
    );
    const at = script.indexOf('AS quiet_min');

    expect(at).toBeGreaterThan(-1);
    const silenceQuery = script.slice(script.lastIndexOf('QUIET_FOR=', at), at);
    expect(silenceQuery).not.toContain('heartbeat');
  });
});

describe('a failing probe is the signal, not a crash', () => {
  it('reports the failure instead of throwing it into the interval', async () => {
    quietFor(90);
    messagesCreate.mockRejectedValue(new Error('529 overloaded'));

    await expect(beatOnce()).resolves.toBe('failed');
    expect(recordUsage).not.toHaveBeenCalled();
  });

  /**
   * AND A LEDGER WRITE THAT FAILS DOES NOT UNDO A PROBE THAT SUCCEEDED. The
   * provider answered; that is the fact the night needs. Losing it to a
   * bookkeeping error would turn the one piece of good news into „failed".
   */
  it('still reports success when only the bookkeeping fails', async () => {
    quietFor(90);
    recordUsage.mockRejectedValue(new Error('ledger insert failed'));

    await expect(beatOnce()).resolves.toBe('sent');
  });
});

/**
 * THE WIRE. A cron that is written and never started is the fault this project
 * has now had twice — row 254 shipped and sat dead for eight hours because
 * nothing ran it, and „built" was reported as „working" the same day this file
 * was written.
 */
describe('it is actually started', () => {
  it('index.ts starts it where the other crons start', () => {
    const index = readFileSync(join(__dirname, '..', '..', 'index.ts'), 'utf8');

    expect(index).toContain("from './services/heartbeat.cron'");
    expect(index).toContain('startHeartbeat();');
  });
});
