jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../userProfile.service', () => ({
  __esModule: true,
  getUserProfile: jest.fn().mockResolvedValue({ profession: 'იურისტი' }),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { whatNetaiKnowsAboutMe } from '../aboutMe.service';

/**
 * #1354 (Giorgi, 5 Oct): „I have no public information about you", while two
 * others asking about him were told his profession.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const rows = (list: readonly Record<string, unknown>[]): void => {
  mockQuery.mockResolvedValueOnce({ rows: list, rowCount: list.length } as never);
};

beforeEach(() => mockQuery.mockReset());

describe('whatNetaiKnowsAboutMe', () => {
  it('gives his name, his numbers, his profile and what others are shown', async () => {
    rows([{ name: 'გიორგი' }]);
    rows([{ phone: '+995599000111' }]);
    rows([{ field_type: 'occupation', value: 'იურისტი' }]);
    await expect(whatNetaiKnowsAboutMe('501')).resolves.toEqual({
      name: 'გიორგი',
      own_numbers: ['+995599000111'],
      my_profile: { profession: 'იურისტი' },
      what_others_see: [{ field_type: 'occupation', value: 'იურისტი' }],
    });
    const [sql, params] = mockQuery.mock.calls[2];
    expect(sql).toContain('is_public = true AND retracted_at IS NULL');
    expect(sql).not.toContain('submitted_by_user_id');
    expect(params).toEqual([['+995599000111'], 40]);
  });

  it('reads no facts when he has no number', async () => {
    rows([{ name: null }]);
    rows([]);
    const me = await whatNetaiKnowsAboutMe('501');
    expect(me.what_others_see).toEqual([]);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});

describe('the tool', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('is offered, lets his own numbers through the scrub, and never names who saved a fact', () => {
    expect(chat).toContain('  ABOUT_ME_TOOL,\n');
    expect(chat).toContain('registerAllowedNumber(runId, own)');
    expect(chat).toContain('Never say who saved a fact.');
  });
});
