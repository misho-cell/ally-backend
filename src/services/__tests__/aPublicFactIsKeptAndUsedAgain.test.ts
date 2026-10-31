jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
const mockLog = jest.fn().mockResolvedValue(undefined);
jest.mock('../toolCallLog.service', () => ({
  __esModule: true,
  logToolCall: (...a: unknown[]) => mockLog(...a),
}));

import { query } from '../../db/postgres/client';
import {
  askKey,
  FACT_FRESH_DAYS,
  isFresh,
  isSameAsk,
  officialSources,
  rememberedAnswer,
} from '../publicFacts';
import { forgetFact, keepFact, recallFact } from '../publicFacts.service';
import { askTheWorldOrRecall, WorldAnswerEngine } from '../worldAnswer.service';
import { WorldAnswer } from '../worldAnswer';

/**
 * #8350 item 4 (the founder via the tester, box 79213; Misho's yes, 31 Oct): a
 * public fact found on an official page is kept and used for the same question
 * by any member, instead of searching from zero. Only who holds the office and
 * the official page, with the date checked; no contacts, nothing private.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const rows = (r: unknown[]): never => ({ rows: r, rowCount: r.length }) as never;

const QUESTION = 'ჯანდაცვის მინისტრთან მინდა შეხვედრა. ვინ არის ახლა მინისტრი?';
const PERSON = { name: 'Nino Example', role: 'Minister', organisation: 'Ministry of Health' };
const OFFICIAL = { title: 'Ministry', url: 'https://www.moh.gov.ge/ka/minister', snippet: '' };
const NEWS = { title: 'News', url: 'https://news.example.ge/a', snippet: '' };
const ANSWER: WorldAnswer = { text: 'x', people: [PERSON], sources: [NEWS, OFFICIAL] };

beforeEach(() => {
  mockQuery.mockReset();
  mockLog.mockClear();
});

describe('a question compared with a kept one', () => {
  it('is its distinct words, so the same ask matches whatever its order or case', () => {
    expect(askKey('Who is the Minister? the minister')).toBe('minister the who');
    expect(isSameAsk(askKey(QUESTION), askKey(QUESTION.toUpperCase()))).toBe(true);
  });

  it('is not the same as a question about another office', () => {
    expect(isSameAsk(askKey(QUESTION), askKey('ვინ არის ახლა განათლების მინისტრი?'))).toBe(false);
  });
});

describe('what is kept', () => {
  it('is only the official pages of an answer', () => {
    expect(officialSources([NEWS, OFFICIAL])).toEqual([{ title: 'Ministry', url: OFFICIAL.url }]);
  });

  it('is nothing when no official page was cited', async () => {
    expect(await keepFact(QUESTION, 'ka', { ...ANSWER, sources: [NEWS] })).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('is the people and the official pages, replacing an older answer, old facts dropped', async () => {
    mockQuery.mockResolvedValue(rows([]));
    expect(await keepFact(QUESTION, 'ka', ANSWER)).toBe(true);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('ON CONFLICT (language, ask_key) DO UPDATE');
    expect(JSON.parse(String((params as unknown[])[3]))).toEqual([
      { title: 'Ministry', url: OFFICIAL.url },
    ]);
    expect(String(mockQuery.mock.calls[1][0])).toContain('DELETE FROM public_office_facts');
  });
});

describe('a kept fact used again', () => {
  const fact = {
    id: 1,
    askKey: askKey(QUESTION),
    people: [PERSON],
    sources: [{ title: 'Ministry', url: OFFICIAL.url }],
    checkedAt: new Date('2026-10-31T05:00:00Z'),
  };

  it('says who, where, and the day it was checked on the official page', () => {
    const answer = rememberedAnswer(fact, 'ka');
    expect(answer?.text).toBe(
      'Nino Example — Minister, Ministry of Health.\nოფიციალურ გვერდზე შემოწმდა 31.10.2026-ს.',
    );
    expect(answer?.sources[0].url).toBe(OFFICIAL.url);
    expect(rememberedAnswer(fact, 'ru')).toBeNull();
  });

  it('is fresh for a week only', () => {
    const now = new Date(fact.checkedAt.getTime() + (FACT_FRESH_DAYS - 1) * 86_400_000);
    expect(isFresh(fact.checkedAt, now)).toBe(true);
    expect(isFresh(fact.checkedAt, new Date(now.getTime() + 2 * 86_400_000))).toBe(false);
  });

  it('is read only within the fresh week, and a failed read is no fact', async () => {
    mockQuery.mockResolvedValueOnce(
      rows([
        {
          id: 1,
          ask_key: askKey(QUESTION),
          people: [PERSON],
          sources: fact.sources,
          checked_at: fact.checkedAt,
        },
      ]),
    );
    expect((await recallFact(QUESTION, 'ka'))?.id).toBe(1);
    expect(String(mockQuery.mock.calls[0][0])).toContain('make_interval(days => $2)');
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await recallFact(QUESTION, 'ka')).toBeNull();
  });

  it('answers at once, with no engine asked, logged as memory', async () => {
    mockQuery.mockResolvedValueOnce(
      rows([
        {
          id: 1,
          ask_key: askKey(QUESTION),
          people: [PERSON],
          sources: fact.sources,
          checked_at: fact.checkedAt,
        },
      ]),
    );
    const fetchSpy = jest.spyOn(global, 'fetch');
    const answer = await askTheWorldOrRecall(
      { userId: '7', runId: 'r', threadId: 9 },
      QUESTION,
      'ka',
    );
    expect(answer?.people[0].name).toBe('Nino Example');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockLog.mock.calls[0][0].input.engine).toBe(WorldAnswerEngine.Memory);
  });

  it('can be forgotten when someone says it changed', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
    expect(await forgetFact(1)).toBe(true);
  });
});
