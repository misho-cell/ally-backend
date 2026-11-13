jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../tools/searchByTag', () => ({ __esModule: true, searchByTag: jest.fn() }));
jest.mock('../tools/searchByInsight', () => ({ __esModule: true, searchByInsight: jest.fn() }));
jest.mock('../tools/searchSecondDegree', () => ({
  __esModule: true,
  searchSecondDegree: jest.fn(),
}));
jest.mock('../farCircles.service', () => ({
  __esModule: true,
  FarDepth: { Labels: 'labels', Everything: 'everything' },
  farMembersHolding: jest.fn(),
}));
jest.mock('../tools/searchNeeds', () => ({ __esModule: true, searchNeeds: jest.fn() }));
jest.mock('../tools/findCompaniesForNeed', () => ({
  __esModule: true,
  findCompaniesForNeed: jest.fn(),
}));
jest.mock('../tools/findPeopleInBase', () => ({ __esModule: true, findPeopleInBase: jest.fn() }));
jest.mock('../tools/searchMeanings', () => ({ __esModule: true, searchMeanings: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';

import { query } from '../../db/postgres/client';
import { farMembersHolding } from '../farCircles.service';
import {
  Contacted,
  FULL_RESEARCH_HEADER,
  forgetResearch,
  markPeople,
  peopleNamedIn,
  RESEARCH_KEPT_MS,
  ResearchLevel,
  ResearchRequest,
  researchWaiting,
  runFullResearch,
  takeResearch,
} from '../fullResearch.service';
import { findCompaniesForNeed } from '../tools/findCompaniesForNeed';
import { findPeopleInBase } from '../tools/findPeopleInBase';
import { searchByInsight } from '../tools/searchByInsight';
import { searchByTag } from '../tools/searchByTag';
import { searchMeanings } from '../tools/searchMeanings';
import { searchNeeds } from '../tools/searchNeeds';
import { searchSecondDegree } from '../tools/searchSecondDegree';

const mocked = <T>(fn: T): jest.Mock => fn as unknown as jest.Mock;

const OWNER = '186272';
const THREAD = 501;
const GOAL = 77;
const MEANINGS = new Map([['sales', ['გაყიდვები']]]);
const NINO = { phone: '+995599000111', name: 'Nino Beridze' };
const LEVAN = { phone: '+995599000222', name: 'Levan Japaridze' };

function request(overrides: Partial<ResearchRequest> = {}): ResearchRequest {
  return {
    userId: OWNER,
    threadId: THREAD,
    taskId: GOAL,
    words: 'freelance sales',
    ownerLine: 'I need a freelance salesperson',
    withheld: new Set<string>(),
    askedAt: new Date(1_000),
    ...overrides,
  };
}

function everySearchFinds(): void {
  mocked(searchMeanings).mockResolvedValue(MEANINGS);
  mocked(searchByTag).mockResolvedValue({ results: [NINO] });
  mocked(searchByInsight).mockResolvedValue({ results: [] });
  mocked(searchSecondDegree).mockResolvedValue({ results: [LEVAN] });
  mocked(farMembersHolding).mockResolvedValue([]);
  mocked(searchNeeds).mockResolvedValue({ results: [] });
  mocked(findCompaniesForNeed).mockResolvedValue({ companies: [] });
  mocked(findPeopleInBase).mockResolvedValue({ results: [] });
}

/** The replies since the ask name Nino; Levan was asked directly on the goal. */
function theConversationSoFar(): void {
  mocked(query).mockImplementation(async (sql: string) => {
    if (sql.includes('FROM conversations')) {
      return { rows: [{ content: 'Your contact Nino Beridze does B2B sales.' }] } as never;
    }
    return { rows: [{ phone: LEVAN.phone, how: 'asked' }] } as never;
  });
}

/**
 * Misho, 13 Nov: a request gets a quick first answer, and the full research of
 * all five levels goes on in the background and comes back as a second answer —
 * looking deeper into the first two levels too, and marking anyone already in
 * the first answer, and whether they were written to.
 */
describe('the full research', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    forgetResearch();
    everySearchFinds();
    theConversationSoFar();
  });

  it('searches every level, the first two with the words’ other meanings', async () => {
    await runFullResearch(request());

    expect(searchByTag).toHaveBeenCalledWith(OWNER, 'freelance sales', MEANINGS);
    expect(searchByInsight).toHaveBeenCalledWith(OWNER, 'freelance sales');
    expect(searchSecondDegree).toHaveBeenCalledWith(
      OWNER,
      'freelance sales',
      'I need a freelance salesperson',
      MEANINGS,
    );
    expect(farMembersHolding).toHaveBeenCalledWith(
      186272,
      'freelance sales',
      undefined,
      MEANINGS,
      'everything',
    );
    expect(searchNeeds).toHaveBeenCalledWith(OWNER, 'freelance sales', MEANINGS);
    expect(findCompaniesForNeed).toHaveBeenCalledWith(OWNER, 'freelance sales გაყიდვები');
    expect(findPeopleInBase).toHaveBeenCalledWith(OWNER, 'freelance sales გაყიდვები');
  });

  it('is kept for the conversation and taken once', async () => {
    expect(await runFullResearch(request(), () => 5_000)).toBe(true);
    expect(researchWaiting(THREAD, 5_001)).toBe(true);

    expect(await takeResearch(OWNER, THREAD, 5_002)).not.toBeNull();
    expect(await takeResearch(OWNER, THREAD, 5_003)).toBeNull();
    expect(researchWaiting(THREAD, 5_004)).toBe(false);
  });

  it('is dropped when nobody took it in time, so a later run never reads it as news', async () => {
    await runFullResearch(request(), () => 0);
    expect(researchWaiting(THREAD, RESEARCH_KEPT_MS + 1)).toBe(false);
    expect(await takeResearch(OWNER, THREAD, RESEARCH_KEPT_MS + 2)).toBeNull();
  });

  it('says a level that failed failed, and still gives the rest', async () => {
    mocked(searchSecondDegree).mockRejectedValue(new Error('timeout'));
    await runFullResearch(request(), () => 0);

    const taken = await takeResearch(OWNER, THREAD, 1);
    expect(taken?.section).toContain(`${ResearchLevel.Second.toUpperCase()}: did not finish.`);
    expect(taken?.section).toContain('Nino Beridze');
  });

  it('never names someone the owner ruled out for this', async () => {
    await runFullResearch(request({ withheld: new Set(['995599000222']) }), () => 0);

    const taken = await takeResearch(OWNER, THREAD, 1);
    expect(taken?.people.map((p) => p.name)).toEqual(['Nino Beridze']);
  });

  it('marks who was in the previous answer and who was written to', async () => {
    await runFullResearch(request(), () => 0);

    const taken = await takeResearch(OWNER, THREAD, 1);
    expect(taken?.section.startsWith(FULL_RESEARCH_HEADER)).toBe(true);
    expect(taken?.section).toContain(
      '- Nino Beridze (phone id +995599000111): in the previous answer: yes; not written to',
    );
    expect(taken?.section).toContain(
      '- Levan Japaridze (phone id +995599000222): in the previous answer: no; asked directly',
    );
  });

  it('reads the replies since the owner asked, and the asks and introductions of this goal', async () => {
    await runFullResearch(request(), () => 0);
    await takeResearch(OWNER, THREAD, 1);

    const [repliesSql, repliesParams] = mocked(query).mock.calls.find(([sql]) =>
      String(sql).includes('FROM conversations'),
    ) as [string, unknown[]];
    expect(repliesSql).toContain("role = 'assistant' AND created_at >= $2");
    expect(repliesParams[1]).toEqual(new Date(1_000));
    const [contactedSql, contactedParams] = mocked(query).mock.calls.find(([sql]) =>
      String(sql).includes('task_asks'),
    ) as [string, unknown[]];
    expect(contactedSql).toContain('FROM introduction_requests r');
    expect(contactedParams).toEqual([OWNER, THREAD, GOAL]);
  });
});

describe('the people the findings name', () => {
  it('are found at any depth, once each, with the first name given', () => {
    const people = peopleNamedIn([
      { level: ResearchLevel.Own, result: { results: [NINO] } },
      {
        level: ResearchLevel.Companies,
        result: { companies: [{ people: [{ ...NINO, name: null }, LEVAN] }] },
      },
      { level: ResearchLevel.Second, result: null },
    ]);
    expect(people).toEqual([NINO, LEVAN]);
  });

  it('are marked in the previous answer only by a name long enough to mean someone', () => {
    const [marked] = markPeople([{ phone: '+1', name: 'Al' }], 'al said hello', {
      asked: new Set(),
      introduced: new Set(),
    });
    expect(marked.inPreviousAnswer).toBe(false);
    expect(marked.contacted).toBe(Contacted.No);
  });

  it('say an introduction was requested when one was', () => {
    const [marked] = markPeople([LEVAN], '', {
      asked: new Set(),
      introduced: new Set(['995599000222']),
    });
    expect(marked.contacted).toBe(Contacted.IntroductionRequested);
  });
});

describe('the two answers in the chat', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');

  it('starts the full research once the run has both: the opening search’s words and a goal here', () => {
    expect(chat).toContain(
      'startOpeningSearches(userId, userMessage, runId, threadId, autoGoalId)',
    );
    expect(chat).toContain('openingWordsLanded(runId, found.query ?? null);');
    expect(chat).toContain(
      'if (opening === undefined || opening.query === null || opening.taskId === null) return;',
    );
  });

  it('starts it too for a goal the model opens in the run (live, 13 Nov: both goals that night were)', () => {
    expect(chat).toContain(
      'const researching = movedTo === undefined && goalOpenedInRun(runId, id);',
    );
    expect(chat).toContain('...(researching && { full_research_note: QUICK_ANSWER_NOTE.trim() }),');
  });

  it('forgets a run’s opening that never got a goal, so nothing is kept for ever', () => {
    expect(chat).toContain('  openingRunEnded(runId);\n');
    expect(chat).toContain(
      'if (opening.taskId === null && opening.query !== null) runOpenings.delete(runId);',
    );
  });

  it('starts only once the quick answer is done, so it never slows the quick searches', () => {
    // Measured on live, 13 Nov: started beside the first run, its searches slowed that run's to ~20 s.
    expect(chat).toContain('void untilConversationQuiet(taskId, threadId)');
    expect(chat).toContain('const busy = await conversationIsBusy(taskId, threadId)');
  });

  it('tells the first run its answer is the quick one', () => {
    expect(chat).toContain("(autoGoalId === null ? '' : QUICK_ANSWER_NOTE)");
  });

  it('hands the findings to the run that comes first: this one mid-way, or the next', () => {
    expect(chat).toContain('(await fullResearchForRun(userId, threadId, runId))');
    expect(chat).toContain(
      'const fullResearch = (await fullResearchForRun(userId, threadId, runId)).trim();',
    );
  });

  it('lets the run walk to and ask everyone the findings name', () => {
    expect(chat).toContain('notePeopleFound(runId, { results: taken.people });');
  });

  it('wakes the goal for the second answer only while nobody has taken them, as news, day or night', () => {
    expect(chat).toContain(
      'wakeWithFullResearch(taskId, FULL_RESEARCH_EVENT, async () => researchWaiting(threadId));',
    );
    const wake = engine.slice(engine.indexOf('export function wakeWithFullResearch'));
    expect(wake).toContain('WakeOrigin.Owner,\n    ANSWER_IS_NEWS,');
    expect(wake).toContain('(await stillWanted()) && (await goalOpen(taskId))');
  });
});
