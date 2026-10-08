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

/** Each read answered by what it asks for, whatever order they run in. */
function answer(byTable: Readonly<Record<string, readonly Record<string, unknown>[]>>): void {
  mockQuery.mockImplementation(((sql: string) => {
    const key = Object.keys(byTable).find((table) => sql.includes(table));
    const list = key === undefined ? [] : byTable[key];
    return Promise.resolve({ rows: list, rowCount: list.length });
  }) as never);
}

const callFor = (table: string): unknown[] =>
  mockQuery.mock.calls.find(([sql]) => String(sql).includes(table)) ?? [];

beforeEach(() => mockQuery.mockReset());

describe('whatNetaiKnowsAboutMe', () => {
  it('gives his name, his numbers, his profile and what others are shown', async () => {
    answer({
      'FROM "User"': [{ name: 'გიორგი' }],
      'FROM "UserPhone"': [{ phone: '+995599000111' }],
      'FROM contact_facts': [{ field_type: 'occupation', value: 'იურისტი' }],
    });
    await expect(whatNetaiKnowsAboutMe('501')).resolves.toEqual({
      name: 'გიორგი',
      own_numbers: ['+995599000111'],
      my_profile: { profession: 'იურისტი' },
      what_others_see: [{ field_type: 'occupation', value: 'იურისტი' }],
      my_answers: [],
    });
    const [sql, params] = callFor('FROM contact_facts');
    expect(sql).toContain('is_public = true AND retracted_at IS NULL');
    expect(sql).not.toContain('submitted_by_user_id');
    expect(params).toEqual([['+995599000111'], 40]);
  });

  it('reads no facts when he has no number', async () => {
    answer({ 'FROM "User"': [{ name: null }] });
    const me = await whatNetaiKnowsAboutMe('501');
    expect(me.what_others_see).toEqual([]);
    expect(callFor('FROM contact_facts')).toEqual([]);
  });

  // 2740: the answers to the profile questions are part of what Netai knows.
  it('says back his answers to the profile questions', async () => {
    answer({
      'FROM "User"': [{ name: 'გიორგი' }],
      'FROM answer_events': [
        {
          question_ka: 'რომელი თხოვნა გიღვიძებს სურვილს რომ დაეხმარო?',
          question_en: 'Which ask makes you want to help?',
          picked_ka: 'კონკრეტული და გასაგები თხოვნა',
          picked_en: 'A clear, specific ask',
          free_text: null,
        },
        {
          question_ka: 'რა გავაკეთო?',
          question_en: null,
          picked_ka: null,
          picked_en: null,
          free_text: 'მომწერე',
        },
        {
          question_ka: 'ცარიელი',
          question_en: null,
          picked_ka: null,
          picked_en: null,
          free_text: null,
        },
      ],
    });
    const me = await whatNetaiKnowsAboutMe('501');
    expect(me.my_answers).toEqual([
      {
        question_ka: 'რომელი თხოვნა გიღვიძებს სურვილს რომ დაეხმარო?',
        question_en: 'Which ask makes you want to help?',
        answer_ka: 'კონკრეტული და გასაგები თხოვნა',
        answer_en: 'A clear, specific ask',
      },
      {
        question_ka: 'რა გავაკეთო?',
        question_en: null,
        answer_ka: 'მომწერე',
        answer_en: 'მომწერე',
      },
    ]);
    const [sql, params] = callFor('FROM answer_events');
    expect(sql).toContain('ae.is_current AND NOT ae.skipped AND ae.answered_at IS NOT NULL');
    expect(params).toEqual(['501', 20]);
  });
});

describe('the tool', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('is offered, wraps his own numbers so the scrub lets them through, and never names who saved a fact', () => {
    expect(chat).toContain('  ABOUT_ME_TOOL,\n');
    expect(chat).toContain(
      'own_numbers: aboutMe.own_numbers.map((own) => `${ALLOW_OPEN}${own}${ALLOW_CLOSE}`)',
    );
    expect(chat).toContain('Never say who saved a fact.');
  });
});
