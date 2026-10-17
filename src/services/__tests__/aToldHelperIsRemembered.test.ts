jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../tools/membership', () => ({
  __esModule: true,
  fetchAccountStates: jest.fn(),
  accountDetailsFor: jest.requireActual('../tools/membership').accountDetailsFor,
}));

import { query } from '../../db/postgres/client';
import { fetchAccountStates } from '../tools/membership';
import { ALWAYS_ON_TOOLS } from '../chat.service';
import { caseTextOf, recordWhoHelped, WhoHelpedRefusal } from '../whoHelped.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockAccounts = fetchAccountStates as jest.MockedFunction<typeof fetchAccountStates>;

const OWNER = '42';
const HELPER = 77;
const PHONE = '+995 599 00 00 01';
const DIGITS = '995599000001';

function memberAt(digits: string, userId: number): Map<string, unknown> {
  return new Map([
    [
      digits,
      {
        state: 'netai_user',
        user_id: userId,
        netai_subscriber: false,
        old_ally_paid: false,
        staff: false,
      },
    ],
  ]);
}

/** Phonebook hit, then the goal, then the insert. */
function routeQueries(opts: { inPhonebook: boolean; goal: boolean; inserted: number }): void {
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('"UserAlias"')) return { rows: opts.inPhonebook ? [{ one: 1 }] : [] } as never;
    if (sql.includes('FROM tasks'))
      return { rows: opts.goal ? [{ id: 9, words: 'თიბისის სესხი გაჭედილია' }] : [] } as never;
    if (sql.includes('INSERT INTO helper_solved_cases'))
      return { rows: [], rowCount: opts.inserted } as never;
    throw new Error(`unexpected query: ${sql}`);
  });
}

const told = {
  ownerId: OWNER,
  phone: PHONE,
  whatWasSolved: 'თამარმა თიბისიში ნაცნობს დაურეკა და სესხი დაამტკიცეს',
  taskId: null,
  threadId: 55573,
};

/**
 * 5446 (D792), the tester's 63100: „I asked Tamar, she called her TBC contact,
 * the loan was approved" taught Netai nothing, because only an answer given
 * inside Netai was remembered. The owner's own word now is.
 */
describe('the person the owner says solved it', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockAccounts.mockReset();
  });

  it('is remembered on the goal, with the goal and the owner’s words', async () => {
    routeQueries({ inPhonebook: true, goal: true, inserted: 1 });
    mockAccounts.mockResolvedValue(memberAt(DIGITS, HELPER) as never);

    expect(await recordWhoHelped(told)).toEqual({ recorded: true, alreadyKnown: false });

    const insert = mockQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO'));
    expect(insert?.[1]).toEqual([
      HELPER,
      42,
      9,
      'თიბისის სესხი გაჭედილია თამარმა თიბისიში ნაცნობს დაურეკა და სესხი დაამტკიცეს TBC',
    ]);
    expect(insert?.[2]).toBeGreaterThan(0);
  });

  it('says so when the same help on the same goal was already known', async () => {
    routeQueries({ inPhonebook: true, goal: true, inserted: 0 });
    mockAccounts.mockResolvedValue(memberAt(DIGITS, HELPER) as never);

    expect(await recordWhoHelped(told)).toEqual({ recorded: true, alreadyKnown: true });
  });

  it('refuses somebody the owner has not saved', async () => {
    routeQueries({ inPhonebook: false, goal: true, inserted: 1 });

    expect(await recordWhoHelped(told)).toEqual({
      recorded: false,
      reason: WhoHelpedRefusal.NotOwnContact,
    });
    expect(mockAccounts).not.toHaveBeenCalled();
  });

  it('refuses a contact who is not on Netai, and the owner themselves', async () => {
    routeQueries({ inPhonebook: true, goal: true, inserted: 1 });
    mockAccounts.mockResolvedValueOnce(new Map() as never);
    expect(await recordWhoHelped(told)).toEqual({
      recorded: false,
      reason: WhoHelpedRefusal.NotAMember,
    });

    mockAccounts.mockResolvedValueOnce(memberAt(DIGITS, 42) as never);
    expect(await recordWhoHelped(told)).toEqual({ recorded: false, reason: WhoHelpedRefusal.Self });
  });

  it('asks for the goal first when the conversation has none', async () => {
    routeQueries({ inPhonebook: true, goal: false, inserted: 1 });
    mockAccounts.mockResolvedValue(memberAt(DIGITS, HELPER) as never);

    expect(await recordWhoHelped(told)).toEqual({
      recorded: false,
      reason: WhoHelpedRefusal.NoGoal,
    });
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO'))).toBe(false);
  });

  it('refuses an empty phone or an empty account before reading anything', async () => {
    expect(await recordWhoHelped({ ...told, phone: '' })).toEqual({
      recorded: false,
      reason: WhoHelpedRefusal.NoPhone,
    });
    expect(await recordWhoHelped({ ...told, whatWasSolved: '  ' })).toEqual({
      recorded: false,
      reason: WhoHelpedRefusal.NoWords,
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('keeps the case text within the limit search matches on', () => {
    expect(caseTextOf('  a ', ' b ')).toBe('a b');
    expect(caseTextOf('x'.repeat(900), 'y'.repeat(900))).toHaveLength(1_000);
  });
});

describe('the tool', () => {
  it("is offered to the model since the founder's yes on its text (D797)", () => {
    expect(ALWAYS_ON_TOOLS.map((tool) => tool.name)).toContain('record_who_helped');
  });
});
