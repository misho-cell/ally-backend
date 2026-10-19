jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { hasAnyAskBoundary } from '../askBoundary.service';
import { askStepsToKeepUnnamed } from '../askCaptions';

/**
 * #1694, the tester's 69059 (thread 61131): „✉️ writing to <B>'s assistant…"
 * showed for a person whose own boundary then stopped the send.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const CLOSED_PHONE = '+995555000159';
const OPEN_PHONE = '+995555000158';

function closedFor(phones: readonly string[]): void {
  mockQuery.mockImplementation((_sql: string, params?: unknown[]) =>
    Promise.resolve({
      rows: [{ closed: phones.some((p) => p.replace(/\D/g, '') === params?.[0]) }],
      rowCount: 1,
    } as never),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('whether a person closed any subject', () => {
  it('asks by the number digits, with a timeout', async () => {
    closedFor([CLOSED_PHONE]);

    await expect(hasAnyAskBoundary(CLOSED_PHONE)).resolves.toBe(true);
    await expect(hasAnyAskBoundary(OPEN_PHONE)).resolves.toBe(false);

    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(sql).toContain('ask_boundaries');
    expect(params).toEqual(['995555000159']);
    expect(typeof timeout).toBe('number');
  });

  it('reads nothing for an empty number', async () => {
    await expect(hasAnyAskBoundary('')).resolves.toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('the ask steps left unnamed', () => {
  it('are the asks to a person with a boundary, and only those', async () => {
    closedFor([CLOSED_PHONE]);

    const unnamed = await askStepsToKeepUnnamed([
      { id: 'a', name: 'ask_contact', input: { phone: CLOSED_PHONE, contact_name: 'B' } },
      { id: 'b', name: 'ask_contact', input: { phone: OPEN_PHONE, contact_name: 'A' } },
      { id: 'c', name: 'search_by_tag', input: { tag_query: 'bank' } },
    ]);

    expect([...unnamed]).toEqual(['a']);
  });

  it('reads nothing when the turn holds no ask', async () => {
    const unnamed = await askStepsToKeepUnnamed([
      { id: 'c', name: 'search_by_tag', input: { tag_query: 'bank' } },
    ]);

    expect(unnamed.size).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('keeps a step unnamed when the read fails, and says so in the log', async () => {
    mockQuery.mockRejectedValue(new Error('timeout'));

    const unnamed = await askStepsToKeepUnnamed([
      { id: 'a', name: 'ask_contact', input: { phone: OPEN_PHONE } },
    ]);

    expect([...unnamed]).toEqual(['a']);
    expect(console.warn).toHaveBeenCalled();
  });
});
