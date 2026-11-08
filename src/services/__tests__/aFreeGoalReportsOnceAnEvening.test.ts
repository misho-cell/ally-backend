const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...args: unknown[]) => mockQuery(...args),
}));
const mockSave = jest.fn();
const mockLanguage = jest.fn();
jest.mock('../threads.service', () => ({
  saveThreadMessage: (...args: unknown[]) => mockSave(...args),
  userLanguage: (...args: unknown[]) => mockLanguage(...args),
}));

import { sweepFreeReports } from '../freeModeReport.cron';
import { FREE_REPORT_LOCAL_HOUR, freeReportText } from '../freeModeReport.service';

/** Misho, 8 Nov: a free-mode goal tells its owner once each evening whom it wrote to. */
describe('the free-mode evening report', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockSave.mockReset();
    mockLanguage.mockReset().mockResolvedValue('ka');
  });

  it('names everyone written to, and who answered', () => {
    const text = freeReportText(
      'Electrician',
      [
        { name: 'Ana', answered: true },
        { name: 'Beka', answered: false },
      ],
      'en',
    );
    expect(text).toBe(
      'Today on „Electrician": I wrote to 2 people: Ana, Beka. Already answered: Ana.',
    );
  });

  it('says nothing about answers when nobody answered yet', () => {
    expect(freeReportText('ხელოსანი', [{ name: 'ანა', answered: false }], 'ka')).toBe(
      'დღევანდელი ანგარიში — „ხელოსანი": მივწერე 1 ადამიანს: ანა.',
    );
  });

  it('is empty when nobody was written to', () => {
    expect(freeReportText('x', [], 'ka')).toBe('');
  });

  it('claims each goal once a day, at the evening hour, only when it wrote to someone', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await sweepFreeReports();
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('UPDATE tasks SET free_report_date');
    expect(sql).toContain('t.free_report_date IS DISTINCT FROM');
    expect(sql).toContain("t.work_mode = 'free'");
    expect(sql).toContain('EXISTS (SELECT 1 FROM task_asks a');
    expect(params).toEqual(['Asia/Tbilisi', FREE_REPORT_LOCAL_HOUR, 50]);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('writes one message per goal into its thread, and one failure does not stop the next', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { id: 1, user_id: '10', thread_id: 100, title: 'A' },
          { id: 2, user_id: '20', thread_id: 200, title: 'B' },
        ],
      })
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ rows: [{ name: 'Nino', answered: false }] });
    await sweepFreeReports();
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith(
      200,
      20,
      'assistant',
      'დღევანდელი ანგარიში — „B": მივწერე 1 ადამიანს: Nino.',
    );
    expect(error).toHaveBeenCalled();
    error.mockRestore();
    log.mockRestore();
  });
});
