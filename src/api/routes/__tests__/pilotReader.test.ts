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
