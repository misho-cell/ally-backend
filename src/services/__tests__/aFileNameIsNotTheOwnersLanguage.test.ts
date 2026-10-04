jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { ATTACHMENT_MARK, ownerMessages, userLanguage } from '../threads.service';

/**
 * The tester's file test (37657, conversation 38193): the refusal for a .pdf
 * came in English on a Georgian conversation. The owner's line for the earlier
 * upload, „📎 kompaniebi.csv", was read as his writing. The file name is not
 * what he typed, so the language reads leave it out.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => jest.clearAllMocks());

describe('the owner’s line for an uploaded file', () => {
  it('is left out of the conversation’s language, by a parameter', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ content: 'სად ვართ სიაზე?' }],
      rowCount: 1,
    } as never);
    await expect(ownerMessages(38193)).resolves.toEqual(['სად ვართ სიაზე?']);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('AND content NOT LIKE $3');
    expect(params).toEqual([38193, 8, `${ATTACHMENT_MARK} %`]);
  });

  it('is left out of the person’s language too', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ content: 'ამ სიაზე იმუშავე' }],
      rowCount: 1,
    } as never);
    await expect(userLanguage('174352')).resolves.toBe('ka');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('AND content NOT LIKE $3');
    expect(params).toEqual(['174352', 8, `${ATTACHMENT_MARK} %`]);
  });
});
