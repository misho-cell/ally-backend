/**
 * Lika, 27 Nov (twice): „the search depth was asked after the search had
 * already started." A new request is held behind the depth card, unsearched;
 * the pick lets it run, and its full research goes at that depth, no second card.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  DEPTH_FIRST_HOLD_MS,
  forgetDepthFirst,
  holdRequestForDepth,
  pickedDepthFor,
  releaseHeldRequest,
  requestWithAnswer,
  spendPickedDepth,
} from '../depthFirst';
import { ResearchDepth } from '../researchDepth';

const THREAD = 52;
const NOW = 1_700_000_000_000;
const REQUEST = 'find me an office to rent in Tbilisi';

describe('a request held behind the depth card', () => {
  beforeEach(() => forgetDepthFirst());

  it('runs on the pick, as the request itself, at the depth picked', () => {
    holdRequestForDepth(THREAD, REQUEST, NOW);
    expect(releaseHeldRequest(THREAD, 'Quick', NOW + 1_000)).toEqual({
      line: REQUEST,
      depth: ResearchDepth.Quick,
    });
    expect(pickedDepthFor(THREAD, NOW + 2_000)).toBe(ResearchDepth.Quick);
    expect(releaseHeldRequest(THREAD, 'Quick', NOW + 3_000)).toBeNull();
  });

  it('a pick written in a sentence is the pick too', () => {
    holdRequestForDepth(THREAD, REQUEST, NOW);
    expect(releaseHeldRequest(THREAD, 'ღრმად მოძებნე, გთხოვ', NOW + 1_000)?.depth).toBe(
      ResearchDepth.Deep,
    );
  });

  it('a line that is not a pick lets the request run with it, at no set depth', () => {
    holdRequestForDepth(THREAD, REQUEST, NOW);
    expect(releaseHeldRequest(THREAD, 'up to 100 m²', NOW + 1_000)).toEqual({
      line: `${REQUEST}\nup to 100 m²`,
      depth: null,
    });
    expect(pickedDepthFor(THREAD, NOW + 2_000)).toBeNull();
  });

  it('the pick is spent once its research starts, and nothing is held forever', () => {
    holdRequestForDepth(THREAD, REQUEST, NOW);
    releaseHeldRequest(THREAD, 'Standard', NOW + 1_000);
    spendPickedDepth(THREAD);
    expect(pickedDepthFor(THREAD, NOW + 2_000)).toBeNull();
    holdRequestForDepth(THREAD, REQUEST, NOW);
    expect(releaseHeldRequest(THREAD, 'Quick', NOW + DEPTH_FIRST_HOLD_MS)).toBeNull();
  });

  it('an answer to a question asked before searching is searched with its request', () => {
    holdRequestForDepth(THREAD, REQUEST, NOW);
    releaseHeldRequest(THREAD, 'Deep', NOW + 1_000);
    expect(requestWithAnswer(THREAD, 'in Vake', NOW + 2_000)).toBe(`${REQUEST}\nin Vake`);
    expect(requestWithAnswer(THREAD, 'near the metro', NOW + 3_000)).toBe(
      `${REQUEST}\nin Vake\nnear the metro`,
    );
    expect(pickedDepthFor(THREAD, NOW + 4_000)).toBe(ResearchDepth.Deep);
  });

  it('with no pick waiting, or once its research started, the answer stands alone', () => {
    expect(requestWithAnswer(THREAD, 'in Vake', NOW)).toBeNull();
    holdRequestForDepth(THREAD, REQUEST, NOW);
    releaseHeldRequest(THREAD, 'Quick', NOW + 1_000);
    spendPickedDepth(THREAD);
    expect(requestWithAnswer(THREAD, 'in Vake', NOW + 2_000)).toBeNull();
  });
});

describe('it is wired into the run', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('asks first on a new request, before the goal and the searches', () => {
    const asked = chat.indexOf('await askDepthBeforeSearching(');
    expect(asked).toBeGreaterThan(-1);
    expect(asked).toBeLessThan(chat.indexOf('const goalForRequest = await ensureGoalForRequest('));
    expect(chat).toContain(
      'startOpeningSearches(userId, requestLine, runId, threadId, autoGoalId)',
    );
    expect(chat).toContain('worldAnswerFor(userId, threadId, runId, requestLine, language)');
  });

  it('reads whether the line answers Netai before the held research forgets it', () => {
    const read = chat.indexOf('const answersTheQuestion = waitsOnTheOwnersAnswer(threadId);');
    expect(read).toBeGreaterThan(-1);
    expect(read).toBeLessThan(
      chat.indexOf('offerOrReleaseResearch(threadId, userMessage, runId);'),
    );
    expect(chat).toContain(
      '(askingFirst && answersTheQuestion ? requestWithAnswer(threadId, userMessage) : null)',
    );
  });

  it('runs the research at the picked depth, with no second card', () => {
    expect(chat).toContain('holdForPick(opening.threadId, research, picked);');
    expect(chat).toContain('startResearchAtPickedDepth(threadId, runId);');
    expect(chat).toContain(
      'startFullResearch(released, threadId, picked ?? ResearchDepth.Normal);',
    );
  });
});
