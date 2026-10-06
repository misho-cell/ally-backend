jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../taskAsks.service', () => ({ __esModule: true, answerIsTheirOwnWords: jest.fn() }));

import { query } from '../../db/postgres/client';
import { mediatorsLinesSinceAsked } from '../introResponse';

/**
 * #1750 (tester 40624): the go-between typed „კი, გავაცნობ, ოღონდ გიორგის
 * მხოლოდ ხვალ საღამოს შეუძლია", then tapped „ჩემი გავლით"; the asker's run
 * received no answer at all. It now reads the go-between's own lines since
 * the request reached them.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const rows = (list: readonly (string | null)[]): void => {
  mockQuery.mockResolvedValueOnce({
    rows: list.map((content) => ({ content })),
    rowCount: list.length,
  } as never);
};

beforeEach(() => mockQuery.mockReset());

describe('mediatorsLinesSinceAsked', () => {
  it('gives the typed lines oldest first, so the condition before a tap is kept', async () => {
    rows(['ჩემი გავლით', '', 'კი, გავაცნობ, ოღონდ მხოლოდ ხვალ საღამოს შეუძლია']);
    await expect(mediatorsLinesSinceAsked(40462, '2026-10-06T01:21:05Z')).resolves.toBe(
      'კი, გავაცნობ, ოღონდ მხოლოდ ხვალ საღამოს შეუძლია\nჩემი გავლით',
    );
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('created_at >= $2');
    expect(params).toEqual([40462, '2026-10-06T01:21:05Z', 5]);
  });

  it('leaves out the notes the server writes into the thread', async () => {
    rows(['(სისტემური შენიშვნა: შენ დაწერე…)', 'ვერა, საზღვარგარეთაა']);
    await expect(mediatorsLinesSinceAsked(40461, '2026-10-06T01:21:04Z')).resolves.toBe(
      'ვერა, საზღვარგარეთაა',
    );
  });

  it('is null with no thread, no lines, or a failed read', async () => {
    await expect(mediatorsLinesSinceAsked(null, '2026-10-06T01:21:04Z')).resolves.toBeNull();
    rows([null, '']);
    await expect(mediatorsLinesSinceAsked(1, '2026-10-06T01:21:04Z')).resolves.toBeNull();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    await expect(mediatorsLinesSinceAsked(1, '2026-10-06T01:21:04Z')).resolves.toBeNull();
    spy.mockRestore();
  });
});
