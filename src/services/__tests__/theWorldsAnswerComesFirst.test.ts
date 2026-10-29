jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordFixedUsage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../tools/webSearchProvider', () => ({
  ...jest.requireActual('../tools/webSearchProvider'),
  webSearchLedger: jest.fn().mockResolvedValue({ provider: 'gemini', priceKey: 'gemini.search' }),
}));
jest.mock('../toolCallLog.service', () => ({
  __esModule: true,
  logToolCall: jest.fn().mockResolvedValue(undefined),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { logToolCall } from '../toolCallLog.service';
import { GeminiResponse } from '../tools/geminiSearch';
import {
  MAX_SOURCES_SHOWN,
  peopleFromLine,
  splitPeopleLine,
  worldAnswerFrom,
  worldAnswerMessage,
  worldAnswerSection,
  worldQuestionPrompt,
} from '../worldAnswer';
import {
  askTheWorld,
  resetWorldAnswerSwitchForTests,
  WORLD_ANSWER_FLAG,
  worldAnswerSwitchOn,
} from '../worldAnswer.service';

/**
 * #8350 (founder, 29 Oct): an ask about the world gets the web's answer first,
 * with its pages, and the run builds the route to the people it names.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockLog = logToolCall as jest.MockedFunction<typeof logToolCall>;
const QUESTION = 'Who heads the city transport service, and how do I reach them?';
const OFFICE_PAGE = 'https://city.example.ge/transport';
const ANSWER =
  'Nino Example heads the City Transport Service since November 2024 (city page, 2026). ' +
  'The office phone is +995 32 200 00 00.\nPEOPLE: Nino Example | Head | City Transport Service';

function grounded(text: string, pages: number = 1): GeminiResponse {
  const chunks = Array.from({ length: pages }, (_, i) => ({
    web: { uri: i === 0 ? OFFICE_PAGE : `https://news.example.ge/${i}`, title: `Page ${i}` },
  }));
  return {
    candidates: [
      {
        content: { parts: [{ text }] },
        groundingMetadata: {
          groundingChunks: chunks,
          groundingSupports: [
            {
              segment: { text: 'The office phone is +995 32 200 00 00.' },
              groundingChunkIndices: [0],
            },
          ],
        },
      },
    ],
  };
}

const okResponse = (data: GeminiResponse): Response =>
  ({ ok: true, json: async () => data, text: async () => '' }) as unknown as Response;

beforeEach(() => {
  jest.clearAllMocks();
  resetWorldAnswerSwitchForTests();
  process.env.GEMINI_API_KEY = 'test-key';
});

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
  jest.restoreAllMocks();
});

describe('the question put to the web (#8350)', () => {
  it('asks in Georgian and English, for who holds a post now, in the member’s language', () => {
    const prompt = worldQuestionPrompt(QUESTION, 'ka');
    expect(prompt).toContain('in Georgian AND in English');
    expect(prompt).toContain('the person who holds it now');
    expect(prompt).toContain('Answer in Georgian');
    expect(prompt).toContain('never mention a search, a search engine, Google or Gemini');
    expect(prompt.endsWith(`Question: ${QUESTION}`)).toBe(true);
  });
});

describe('the answer read back (#8350)', () => {
  it('splits the people line from the answer', () => {
    const { body, people } = splitPeopleLine(ANSWER);
    expect(body).not.toContain('PEOPLE:');
    expect(people).toEqual([
      { name: 'Nino Example', role: 'Head', organisation: 'City Transport Service' },
    ]);
    expect(peopleFromLine('none')).toEqual([]);
    expect(peopleFromLine('A | Head | X; B | Deputy')).toHaveLength(2);
  });

  it('is shown with its pages', () => {
    const answer = worldAnswerFrom(grounded(ANSWER), QUESTION);
    expect(answer?.text).toContain('Nino Example heads');
    expect(answer?.sources[0].url).toBe(OFFICE_PAGE);
  });

  it('is not shown when the web has nothing, gives no page, or names the engine', () => {
    expect(worldAnswerFrom(grounded('NONE\nPEOPLE: none'), QUESTION)).toBeNull();
    expect(worldAnswerFrom(grounded(ANSWER, 0), QUESTION)).toBeNull();
    expect(worldAnswerFrom(grounded(`Google says: ${ANSWER}`), QUESTION)).toBeNull();
    expect(
      worldAnswerFrom(grounded(`Google says: ${ANSWER}`), 'Who runs Google Georgia?'),
    ).not.toBeNull();
  });
});

describe('the member’s message and the run’s section (#8350)', () => {
  const answer = worldAnswerFrom(grounded(ANSWER, 5), QUESTION);

  it('the message is the answer, then at most three pages, in the member’s language', () => {
    const message = worldAnswerMessage(answer!, 'ka');
    expect(message.startsWith('Nino Example heads')).toBe(true);
    expect(message).toContain('წყაროები:');
    expect(message).toContain(OFFICE_PAGE);
    expect(message.match(/https:\/\//gu)).toHaveLength(MAX_SOURCES_SHOWN);
  });

  it('the run is told what is already shown, and to find the route to the people named', () => {
    const section = worldAnswerSection(answer!);
    expect(section).toContain('ALREADY ON THE OWNER’S SCREEN');
    expect(section).toContain('Nino Example — Head — City Transport Service');
    expect(section).toContain('Do not repeat it');
    expect(section).toContain('find_warm_path');
  });
});

describe('asking the web (#8350)', () => {
  const run = { userId: '7', runId: 'r1', threadId: 9 };

  it('is off unless the switch is on and there is a key', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ enabled: false }], rowCount: 1 } as never);
    expect(await worldAnswerSwitchOn()).toBe(false);
    expect(mockQuery.mock.calls[0][1]).toEqual([WORLD_ANSWER_FLAG]);
    resetWorldAnswerSwitchForTests();
    delete process.env.GEMINI_API_KEY;
    expect(await worldAnswerSwitchOn()).toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('returns the answer with its pages, and logs it', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(okResponse(grounded(ANSWER)));
    const answer = await askTheWorld(run, QUESTION, 'en');
    expect(answer?.people[0].name).toBe('Nino Example');
    expect(mockLog.mock.calls[0][0].tool).toBe('world_answer:opening');
    expect(mockLog.mock.calls[0][0].resultSample).toContain(OFFICE_PAGE);
  });

  it('never throws: a failed call is no answer', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await askTheWorld(run, QUESTION, 'en')).toBeNull();
  });
});

describe('the run (#8350)', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('asks only on a new goal, never to reach a person or with people named to ask', () => {
    const due = chat.slice(chat.indexOf('function worldAnswerIsDue('));
    const body = due.slice(0, due.indexOf('\n}'));
    expect(body).toContain('!goalAsksToReachAPerson(ownerLine)');
    expect(body).toContain('!ownerLineNamesPeopleToAsk(ownerLine)');
    expect(body).toContain('!needsNoOpeningSearch(ownerLine)');
  });

  it('waits for the answer before the first turn, and posts it after the owner’s line', () => {
    const awaited = chat.indexOf('const worldAnswer = await worldAnswerWork;');
    const section = chat.indexOf('worldAnswerSection(worldAnswer)');
    const ownerLine = chat.indexOf(
      "userMessage.startsWith(RUN_EVENT_PREFIX) ? 'event' : 'message',",
    );
    const posted = chat.indexOf('await postWorldAnswer(userId, threadId, runId, worldAnswer);');
    expect(awaited).toBeGreaterThan(-1);
    expect(section).toBeGreaterThan(awaited);
    expect(posted).toBeGreaterThan(ownerLine);
    expect(chat.indexOf('await runToolLoop(', posted)).toBeGreaterThan(posted);
  });
});
