jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { saysNothing, setUserProfileField } from '../userProfile.service';

/**
 * #6469 (the tester's 69108, 3 of 3): deleting „I work at TBC" wrote
 * „უცნობია" into the profession instead of emptying it.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as never);
});

describe('a profile value that says „nothing"', () => {
  it('is read in every language, with or without quotes and a full stop', () => {
    for (const v of [
      'უცნობია',
      'არ არის მითითებული.',
      '„უცნობია"',
      'Unknown',
      'not specified',
      'не указано',
      '—',
    ]) {
      expect(saysNothing(v)).toBe(true);
    }
  });

  it('is not a real value that merely contains such a word', () => {
    for (const v of ['ბანკის თანამშრომელი', 'unknown artist manager', 'TBC']) {
      expect(saysNothing(v)).toBe(false);
    }
  });

  it('removes the line instead of storing it', async () => {
    const result = await setUserProfileField('501', 'profession', 'არ არის მითითებული');

    expect(result).toEqual({ saved: false, deleted: true });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('DELETE FROM user_profile_kv');
    expect(params).toEqual(['501', ['profession']]);
  });

  it('still stores a real value', async () => {
    const result = await setUserProfileField('501', 'profession', 'ფინანსისტი');

    expect(result).toEqual({ saved: true });
    expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO user_profile_kv');
  });
});
