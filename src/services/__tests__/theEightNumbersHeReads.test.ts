jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';

import { query } from '../../db/postgres/client';
import { pilotOutcomes } from '../pilotOutcomes.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * ROW 274 — THE PILOT NUMBERS THE FOUNDER READS ON ONE PAGE.
 *
 * ⚠️ THE CHAIN-COST CHECK TOOK THREE WRONG QUERIES, and every wrong one would
 * have printed a false alarm on his page. Kept here because the next person to
 * touch this number will reach for the first one.
 *
 *   1. any spend by somebody who has received an ask   -> 11 „helpers charged"
 *      Wrong QUESTION. A helper chatting to Netai for themselves is charged
 *      and should be; D123 is about the ask chain, not the person.
 *   2. spend on an ask thread, from usage_events       -> 529 rows, 18 helpers
 *      Wrong TABLE. usage_events records cost against the conversation; the
 *      wallet debit goes to the payer, and D123 is a promise about the wallet.
 *   3. wallet debits on ask runs, 28 days              -> 65 rows, 4 helpers
 *      Right question, right table, still a false alarm: every one is dated
 *      30 August to 4 September, BEFORE the fix. It would have shown a closed
 *      bug as live.
 *
 * Zero in the last fourteen days and the last seven.
 */
const rows = (...sets: Record<string, unknown>[][]): void => {
  let i = 0;
  mockQuery.mockImplementation(() =>
    Promise.resolve({ rows: sets[i++] ?? [], rowCount: 1 } as never),
  );
};

const ALL = (): Record<string, unknown>[][] => [
  [{ joined: '35', started: '22', helped_only: '4' }],
  [{ resolved: '9', stopped: '97', still_open: '93', paused: '6', waiting: '12' }],
  [{ measured: '58', median: '3.1067' }],
  [{ once: '12', twice: '7', thrice: '2', latest: '2026-09-21' }],
  [{ inviters: '73', invitees: '799', opened: '8', started: '2', paid: '0' }],
  [{ askers: '31', helpers: '4', last_charged: '2026-09-04 22:15:48+00' }],
];

beforeEach(() => jest.clearAllMocks());

describe('the numbers he asked for', () => {
  it('separates people who started a goal from people who only ever helped', async () => {
    rows(...ALL());
    const out = await pilotOutcomes(28);

    expect(out.joined).toBe(35);
    expect(out.started_a_goal).toBe(22);
    expect(out.only_ever_helped).toBe(4);
  });

  it('puts solved beside the states it could have been in instead', async () => {
    rows(...ALL());
    const out = await pilotOutcomes(28);

    expect(out.goals).toEqual({
      resolved: 9,
      stopped: 97,
      open: 93,
      paused: 6,
      waiting_on_a_reply: 12,
    });
  });

  it('counts paying again, not just paying', async () => {
    rows(...ALL());
    const out = await pilotOutcomes(28);

    expect(out.paid.people_who_paid_twice).toBe(7);
    expect(out.paid.people_who_paid_three_times).toBe(2);
  });

  /** The same three-way split the tree uses: 799 invited, 8 ever turned up. */
  it('says how many of the invited actually turned up', async () => {
    rows(...ALL());
    const out = await pilotOutcomes(28);

    expect(out.brought_others.their_invitees).toBe(799);
    expect(out.brought_others.invitees_who_opened_netai).toBe(8);
  });
});

describe('the numbers that are choices, and say so', () => {
  /**
   * „The first useful answer" is not a thing the database knows. The proxy is
   * carried WITH the number so nobody quotes it as something it is not.
   */
  it('defines first progress in the payload, not in a comment somewhere', async () => {
    rows(...ALL());
    const out = await pilotOutcomes(28);

    expect(out.first_answer.median_minutes).toBe(3);
    expect(out.first_answer.definition).toContain('does not know what was useful');
    expect(out.first_answer.definition).toContain('absent from this number');
  });

  /**
   * His fourth number — „asks: answered, declined, never answered — kept
   * apart" — WAS the one that could not be built, and row 274 built it on
   * 26 September: a button whose text is ours, and a column beside the status.
   *
   * ⚠️ THE CAVEAT DID NOT GO AWAY, IT CHANGED. Every ask answered before that
   * day carries no decline either way — „nobody recorded it", not „this was
   * not a refusal" — so a small number here means few people have been asked
   * since the button existed, NOT that few people say no. That sentence has to
   * travel on the same object as the count, which is what this pins.
   */
  it('ships the count with the date recording started, not on its own', async () => {
    rows(...ALL());
    const out = await pilotOutcomes(28);

    expect(out.asks.declines_recorded_since).toBe('2026-09-26');
    expect(out.not_measurable.join(' ')).toContain('recorded only since 2026-09-26');
    expect(out.not_measurable.join(' ')).toContain('not that few people say no');
  });

  it('says when a helper was last charged, so a zero is not read as always', async () => {
    rows(...ALL());
    const out = await pilotOutcomes(28);

    expect(out.chain_cost.helpers_charged).toBe(4);
    expect(out.chain_cost.helper_last_charged).toContain('2026-09-04');
  });
});

describe('it measures the wallet, which is what D123 promises', () => {
  const src = readFileSync(join(__dirname, '..', 'pilotOutcomes.service.ts'), 'utf8');
  const check = src.slice(src.indexOf('WITH helper_debits AS'));

  it('reads token_transactions and not usage_events for who paid', () => {
    expect(check.slice(0, 600)).toContain('FROM token_transactions tt');
    expect(check.slice(0, 600)).toContain('tt.amount < 0');
  });

  it('is scoped to an ask thread, not to a person who has received asks', () => {
    expect(check.slice(0, 600)).toContain('a.ask_thread_id = e.thread_id');
  });

  /** Fictional seats are not people, and he is asking about people. */
  it('leaves test seats out of every number', () => {
    expect(src).toContain('NOT EXISTS (SELECT 1 FROM test_seats ts WHERE ts.user_id = u.id)');
  });
});
