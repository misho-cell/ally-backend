jest.mock('../tools/searchByTag', () => ({ __esModule: true, searchByTagExactOnly: jest.fn() }));
jest.mock('../toolCallLog.service', () => ({
  __esModule: true,
  logToolCall: jest.fn().mockResolvedValue(undefined),
}));

import { searchByTagExactOnly } from '../tools/searchByTag';
import { logToolCall } from '../toolCallLog.service';
import { findWaysIn } from '../openingSearch.service';

/**
 * Board #893: a list row's state follows the goal's ask to the contact its way
 * in goes through, so the lookup hands that contact's number to the caller —
 * and only to the caller: never in the verdict the model reads, never logged.
 */
const mockTag = searchByTagExactOnly as jest.MockedFunction<typeof searchByTagExactOnly>;
const mockLog = logToolCall as jest.MockedFunction<typeof logToolCall>;
const NUMBER = '995500000002';

beforeEach(() => jest.clearAllMocks());

describe('a way in with a contact', () => {
  it('hands the contact’s number to the caller, apart from the verdict and the log', async () => {
    mockTag.mockImplementation(async (_user, query, onFirstPhone) => {
      onFirstPhone?.(NUMBER);
      return { found: true, query, count: 1, results: [{ name: 'Acme Ltd' }] };
    });
    const phones = new Map<string, string>();
    const waysIn = await findWaysIn(
      '501',
      ['Acme Ltd'],
      { threadId: 7, runId: 'r' },
      (name, phone) => phones.set(name, phone),
    );

    expect(waysIn.get('Acme Ltd')).toEqual({ kind: 'first_circle', who: 'Acme Ltd' });
    expect(phones.get('Acme Ltd')).toBe(NUMBER);
    expect(JSON.stringify(Object.fromEntries(waysIn))).not.toContain(NUMBER);
    expect(JSON.stringify(mockLog.mock.calls)).not.toContain(NUMBER);
  });

  it('hands nothing when the contact is not tied to the row', async () => {
    mockTag.mockImplementation(async (_user, query, onFirstPhone) => {
      onFirstPhone?.(NUMBER);
      return { found: true, query, count: 1, results: [{ name: 'გიორგი სანტექნიკი' }] };
    });
    const phones = new Map<string, string>();
    await findWaysIn('501', ['ნინო ბერიძე'], {}, (name, phone) => phones.set(name, phone));

    expect(phones.size).toBe(0);
  });
});
