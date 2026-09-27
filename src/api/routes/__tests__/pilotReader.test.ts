import { readFileSync } from 'fs';
import { join } from 'path';

// The gate on reading other people's conversations. Ticket 19 [16]: the founder
// opened it for the one shared admin login and said it switches off on the last
// day of the 14-day pilot. A date alone does not keep that promise — nothing
// stopped a far date being typed once and forgotten — so the window is bounded.
jest.mock('../../../db/postgres/client', () => ({
  query: jest.fn(),
  __esModule: true,
  default: { end: jest.fn() },
}));

import type { Request } from 'express';
import { pilotReaderAllowed } from '../admin.routes';

function asAdmin(userId: string): Request {
  return { user: { userId } } as unknown as Request;
}

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

const READER = '167250';

beforeEach(() => {
  process.env.PILOT_CONVERSATION_READER_USER_IDS = READER;
  delete process.env.PILOT_CONVERSATION_READER_UNTIL;
});

describe('the pilot conversation reader', () => {
  it('stays shut when no end date is set, and says what to set', () => {
    const gate = pilotReaderAllowed(asAdmin(READER));

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain('PILOT_CONVERSATION_READER_UNTIL');
  });

  it('opens for the named admin inside the window', () => {
    process.env.PILOT_CONVERSATION_READER_UNTIL = inDays(14);

    expect(pilotReaderAllowed(asAdmin(READER)).allowed).toBe(true);
  });

  it('refuses any other admin, even inside the window', () => {
    process.env.PILOT_CONVERSATION_READER_UNTIL = inDays(14);

    expect(pilotReaderAllowed(asAdmin('999')).allowed).toBe(false);
  });

  it('closes itself once the date has passed', () => {
    process.env.PILOT_CONVERSATION_READER_UNTIL = inDays(-1);

    const gate = pilotReaderAllowed(asAdmin(READER));
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain('ended');
  });

  /**
   * The one that makes "temporary" true. Without it, a date set far out once
   * would keep other people's conversations readable for as long as nobody
   * remembered to look.
   */
  it('refuses a window longer than the pilot, so temporary cannot become permanent', () => {
    process.env.PILOT_CONVERSATION_READER_UNTIL = inDays(400);

    const gate = pilotReaderAllowed(asAdmin(READER));
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain('temporary by decision');
  });

  it('refuses a date that is not a date rather than reading on', () => {
    process.env.PILOT_CONVERSATION_READER_UNTIL = 'soon';

    expect(pilotReaderAllowed(asAdmin(READER)).allowed).toBe(false);
  });
});

/**
 * ⚠️ SIX TESTS ON THE GATE, NONE ON ANY OF THE THREE DOORS IT GUARDS.
 *
 * Block-mode sabotage of `admin.routes.ts`, 27 September: each of the three
 * `if (!gate.allowed) {` blocks falsified in turn, and every test above stayed
 * green. They hold `pilotReaderAllowed` from six angles and ask nothing about
 * whether any route consults it.
 *
 * WHAT A DEAD WIRE OPENS. These three routes are the pilot reader — the
 * founder's window into thirteen real people's conversations, deliberately
 * narrowed by D224 to ONE shared login and by D225 to a date that closes
 * itself. With the check dead, every admin token reads them, and the gate's
 * own tests still pass. That is not a worse error message; it is the door
 * standing open while the lock is certified.
 *
 *   GET /pilot/people              the pilot's members by name
 *   GET /pilot/threads             their conversations
 *   GET /pilot/threads/:id/messages  one conversation, in full
 *
 * THE LIST IS BEHIND THE SAME DOOR AS THE READING, on purpose — the file's own
 * comment says a list that names the pilot's members is not a lesser
 * capability. So all three are held here, separately, and by POSITION rather
 * than by text: the same sentence appears three times, and a test using
 * `indexOf` would only ever see the first one die.
 */
describe('all three pilot routes actually ask the gate', () => {
  const routes = readFileSync(join(__dirname, '..', 'admin.routes.ts'), 'utf8');

  const sites = (): number[] => {
    const found: number[] = [];
    let at = routes.indexOf('const gate = pilotReaderAllowed(req);');
    while (at !== -1) {
      found.push(at);
      at = routes.indexOf('const gate = pilotReaderAllowed(req);', at + 1);
    }
    return found;
  };

  it('has exactly three of them, one per route', () => {
    expect(sites()).toHaveLength(3);
  });

  it.each([0, 1, 2])('site %i refuses with 403 and the gate’s own reason', (i) => {
    const at = sites()[i];
    const block = routes.slice(at, at + 260);

    expect(block).toContain('if (!gate.allowed) {');
    expect(block).toContain('res.status(403).json({ success: false, error: gate.reason });');
    expect(block).toContain('return;');
  });

  /**
   * AND THE REFUSAL COMES BEFORE THE READ. A gate consulted after the rows are
   * fetched is a gate on the response, not on the data — and on this door the
   * data is thirteen people's conversations.
   */
  it.each([
    ['people', 'await pilotPeople()'],
    ['threads', 'await getThreadsForUser(String(userId))'],
    ['messages', 'await getThreadMessages(threadId)'],
  ])('the %s route refuses before it reads', (_name, call) => {
    const readAt = routes.indexOf(call);
    const gateBefore = routes.lastIndexOf('if (!gate.allowed) {', readAt);

    expect(readAt).toBeGreaterThan(0);
    expect(gateBefore).toBeGreaterThan(0);
    expect(gateBefore).toBeLessThan(readAt);
  });
});
