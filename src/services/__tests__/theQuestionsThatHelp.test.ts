jest.mock('../../db/postgres/client', () => ({
  query: jest.fn(),
  withTransaction: jest.fn((fn: (c: { query: jest.Mock }) => Promise<unknown>) =>
    fn({ query: jest.fn(() => Promise.resolve({ rows: [], rowCount: 1 })) }),
  ),
  __esModule: true,
}));
jest.mock('../userNotes.service', () => ({ saveUserNote: jest.fn(() => Promise.resolve({})) }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { getNextQuestion, recordAnswer } from '../partH.service';
import { saveUserNote } from '../userNotes.service';

/** 2182 (Lika, 7 Oct): „what do you need to know about me" got silly questions. */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockNote = saveUserNote as jest.MockedFunction<typeof saveUserNote>;
const migration = readFileSync(
  join(__dirname, '..', '..', 'db', 'postgres', 'migrations', '216_core_profile_questions.sql'),
  'utf8',
);

beforeEach(() => jest.clearAllMocks());

describe('the five questions that help', () => {
  it('are in the bank, in her own words, each with its reason', () => {
    for (const id of [
      'core_what_where_001',
      'core_can_help_002',
      'core_looking_for_003',
      'core_dont_ask_004',
      'core_reach_005',
    ]) {
      expect(migration).toContain(`('${id}', 'core', 'any',`);
    }
    expect(migration).toContain('რას საქმიანობ და სად?');
    expect(migration).toContain('ON CONFLICT (question_id) DO NOTHING');
  });

  it('come before every other question', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    await getNextQuestion('180300', 'any', 'ka');
    const [sql] = mockQuery.mock.calls[1] as [string];
    expect(sql).toContain("ORDER BY (qb.category = 'core') DESC, (qb.surface = $2) DESC");
  });
});

describe('a core answer is kept for her own assistant', () => {
  const bankRow = (questionId: string): unknown => ({
    rows: [{ question_id: questionId, select_mode: 'single', score_vector: {}, options: [] }],
    rowCount: 1,
  });

  it('„do not ask me about" becomes a preference (and so a boundary)', async () => {
    mockQuery
      .mockResolvedValueOnce(bankRow('core_dont_ask_004') as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    const out = await recordAnswer('180300', {
      questionId: 'core_dont_ask_004',
      optionIds: [],
      freeText: 'პოლიტიკაზე',
    });
    expect(out.recorded).toBe(true);
    expect(mockNote).toHaveBeenCalledWith('180300', 'preference', 'პოლიტიკაზე');
  });

  it('„what I can help with" becomes a profile note; an old question copies nothing', async () => {
    mockQuery
      .mockResolvedValueOnce(bankRow('core_can_help_002') as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    await recordAnswer('180300', {
      questionId: 'core_can_help_002',
      optionIds: [],
      freeText: 'საბაჟო',
    });
    expect(mockNote).toHaveBeenCalledWith('180300', 'profile', 'საბაჟო');

    mockNote.mockClear();
    mockQuery
      .mockResolvedValueOnce(bankRow('work_planning_style_404') as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    await recordAnswer('180300', {
      questionId: 'work_planning_style_404',
      optionIds: [],
      freeText: 'x',
    });
    expect(mockNote).not.toHaveBeenCalled();
  });
});
