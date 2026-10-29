const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));
const mockSave = jest.fn();
const mockLanguage = jest.fn();
jest.mock('../threads.service', () => ({
  saveThreadMessage: (...a: unknown[]) => mockSave(...a),
  userLanguage: (...a: unknown[]) => mockLanguage(...a),
}));

import {
  closedByYouLine,
  declinedLineForOwner,
  tellCaseClosedByDeleting,
} from '../caseDeclinedByDeleting';

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  jest.resetAllMocks();
  mockLanguage.mockResolvedValue('ka');
  mockSave.mockResolvedValue(undefined);
});

/** #7096 / #7097 (Giorgi, G-180, 21 Oct): a go-between deletes the case — both sides are told. */
describe('a case a go-between or target deletes', () => {
  it('uses Giorgi’s own words, the person in Georgian script and the ergative', () => {
    expect(closedByYouLine('ka')).toBe('შენი თხოვნით ეს მოთხოვნა დავხურე.');
    expect(declinedLineForOwner('ნინო', 'ka')).toBe('ნინომ უარი თქვა ამ საქმეში მონაწილეობაზე.');
    expect(declinedLineForOwner('Nino Ally', 'ka')).not.toMatch(/Ally|Nino/u);
  });

  it('declines the waiting question, tells the owner in the goal’s chat, and the deleter in theirs', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ from_user_id: 7, task_thread_id: 900, reader_name: 'ნინო' }],
      })
      .mockResolvedValue({ rows: [{ status: 'idle' }] });
    await tellCaseClosedByDeleting('537', 61001, 0);
    await flush();
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("SET status = 'answered'");
    expect(sql).toContain('declined_at = COALESCE');
    expect(sql).toContain('wake_delivered_at = NOW()');
    expect(params).toEqual([61001]);
    expect(mockSave).toHaveBeenCalledWith(
      900,
      7,
      'assistant',
      'ნინომ უარი თქვა ამ საქმეში მონაწილეობაზე.',
    );
    expect(mockSave).toHaveBeenCalledWith(
      61001,
      537,
      'assistant',
      'შენი თხოვნით ეს მოთხოვნა დავხურე.',
    );
  });

  /** #7096 / #7097 retest (tester 74813): the asker's run wrote „I sent it" after the decline. */
  it('tells the owner only once the owner’s run has finished, after the deleter', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ from_user_id: 7, task_thread_id: 900, reader_name: 'ნინო' }],
      })
      .mockResolvedValueOnce({ rows: [{ status: 'working' }] })
      .mockResolvedValueOnce({ rows: [{ status: 'working' }] })
      .mockResolvedValue({ rows: [{ status: 'idle' }] });
    await tellCaseClosedByDeleting('537', 61001, 0);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith(
      61001,
      537,
      'assistant',
      'შენი თხოვნით ეს მოთხოვნა დავხურე.',
    );
    await flush();
    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(mockSave).toHaveBeenLastCalledWith(
      900,
      7,
      'assistant',
      'ნინომ უარი თქვა ამ საქმეში მონაწილეობაზე.',
    );
    const statusReads = mockQuery.mock.calls.filter(([sql]) =>
      String(sql).includes('SELECT status FROM threads'),
    );
    expect(statusReads).toHaveLength(3);
  });

  it('with no question waiting, only the deleter is told', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await tellCaseClosedByDeleting('537', 61001);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith(
      61001,
      537,
      'assistant',
      'შენი თხოვნით ეს მოთხოვნა დავხურე.',
    );
  });

  it('never fails the close: a failed write is logged', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockRejectedValueOnce(new Error('down'));
    await expect(tellCaseClosedByDeleting('537', 61001)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith('[case-close] thread 61001: not told:', 'down');
  });
});
