/**
 * Misho, 26 Nov (points 1 and 2): Netai asks before the task starts, and the
 * owner picks how deep the full research goes. The research is held until the
 * pick; when Netai asked first, the depth is offered only once the owner has
 * answered, and the answer travels with the research.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  askedBeforeSearching,
  endsOnAQuestion,
  forgetClarifyingQuestions,
  HELD_RESEARCH_MS,
  holdResearch,
  noteAskedBeforeSearching,
  ownerAnsweredTheQuestion,
  ownerWroteInstead,
  takeHeldResearch,
  takeHeldResearchWith,
  takeUnpickedResearch,
  waitsOnTheOwnersAnswer,
} from '../clarifyingQuestion';

const THREAD = 41;
const NOW = 1_700_000_000_000;
const RESEARCH = {
  userId: '7',
  taskId: 9,
  words: 'snowboard trainer',
  ownerLine: 'find me a snowboard trainer',
  askedAt: new Date(NOW),
};

describe('a question asked before searching', () => {
  beforeEach(() => forgetClarifyingQuestions());

  it('is a reply whose last line is a question, from a run that searched nothing', () => {
    expect(endsOnAQuestion('Got it.\n\nFor a child or an adult?')).toBe(true);
    expect(endsOnAQuestion('For a child or an adult?\n\nI will look then.')).toBe(false);
    expect(askedBeforeSearching('For a child or an adult?', ['create_task'])).toBe(true);
    expect(askedBeforeSearching('Shall I write to Nino Beridze?', ['search_by_tag'])).toBe(false);
    expect(askedBeforeSearching('Shall I write to them?', ['web_search'])).toBe(false);
    expect(askedBeforeSearching('Shall I write to them?', ['find_people_in_base'])).toBe(false);
  });

  it('holds the research; the owner’s answer joins it and the depth is offered then', () => {
    holdResearch(THREAD, RESEARCH, NOW);
    noteAskedBeforeSearching(THREAD, NOW);
    expect(waitsOnTheOwnersAnswer(THREAD, NOW + 1_000)).toBe(true);
    expect(ownerAnsweredTheQuestion(THREAD, 'for my son, 10 years old', NOW + 60_000)).toBe(true);
    expect(waitsOnTheOwnersAnswer(THREAD, NOW + 60_000)).toBe(false);
    const back = takeHeldResearch(THREAD, NOW + 120_000);
    expect(back?.ownerLine).toBe('find me a snowboard trainer\nfor my son, 10 years old');
    expect(back?.words).toBe('snowboard trainer');
    expect(takeHeldResearch(THREAD, NOW + 121_000)).toBeNull();
  });

  it('offers nothing on a line that answers no question of Netai’s', () => {
    holdResearch(THREAD, RESEARCH, NOW);
    expect(ownerAnsweredTheQuestion(THREAD, 'thanks', NOW + 1_000)).toBe(false);
    expect(takeHeldResearch(THREAD, NOW + 2_000)?.ownerLine).toBe(RESEARCH.ownerLine);
  });

  it('does not hold forever', () => {
    noteAskedBeforeSearching(THREAD, NOW);
    expect(waitsOnTheOwnersAnswer(THREAD, NOW + HELD_RESEARCH_MS)).toBe(false);
    holdResearch(THREAD, RESEARCH, NOW);
    expect(takeHeldResearch(THREAD, NOW + HELD_RESEARCH_MS)).toBeNull();
  });

  it('is wired: held when ready, the card dropped when Netai asked, offered on the answer', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('holdForPick(opening.threadId, research);');
    expect(chat).toContain('notePendingItems(runId, [depthCardItem()]);');
    expect(chat).toMatch(
      /askedBeforeSearching\(finalText, toolNamesUsed\)\) \{\s*noteAskedBeforeSearching\(threadId\);\s*dropPendingItems\(runId, RESEARCH_DEPTH_KIND\);/u,
    );
    expect(chat).toContain('offerOrReleaseResearch(threadId, userMessage, runId)');
  });
});

describe('a depth nobody picks never costs the full answer (Lika, 26 Nov)', () => {
  beforeEach(() => forgetClarifyingQuestions());

  it('a line that is not a pick releases the research, with that line', () => {
    holdResearch(THREAD, RESEARCH, NOW);
    const back = ownerWroteInstead(THREAD, 'in Tbilisi', NOW + 60_000);
    expect(back?.ownerLine).toBe('find me a snowboard trainer\nin Tbilisi');
    expect(takeHeldResearch(THREAD, NOW + 61_000)).toBeNull();
  });

  it('does not release it while Netai’s own question waits for its answer', () => {
    holdResearch(THREAD, RESEARCH, NOW);
    noteAskedBeforeSearching(THREAD, NOW);
    expect(ownerWroteInstead(THREAD, 'in Tbilisi', NOW + 1_000)).toBeNull();
  });

  it('a pick in words takes the research once, with that line', () => {
    holdResearch(THREAD, RESEARCH, NOW);
    const back = takeHeldResearchWith(THREAD, 'quick, results first', NOW + 1_000);
    expect(back?.ownerLine).toBe('find me a snowboard trainer\nquick, results first');
    expect(takeHeldResearch(THREAD, NOW + 2_000)).toBeNull();
  });

  it('with no pick in time, the hold it was set for runs; a newer hold is left alone', () => {
    const mark = holdResearch(THREAD, RESEARCH, NOW);
    expect(takeUnpickedResearch(THREAD, mark, NOW + 600_000)?.words).toBe('snowboard trainer');
    const old = holdResearch(THREAD, RESEARCH, NOW);
    holdResearch(THREAD, RESEARCH, NOW + 5);
    expect(takeUnpickedResearch(THREAD, old, NOW + 600_000)).toBeNull();
  });

  it('is wired: a timer runs the standard depth, and a non-pick line releases it', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('const PICK_WAIT_MS = 10 * 60_000;');
    expect(chat).toContain('startFullResearch(unpicked, threadId, ResearchDepth.Normal);');
    expect(chat).toContain('startFullResearch(released, threadId, ResearchDepth.Normal);');
    expect(chat).toContain('if (depthPickOf(line) !== null) return;');
  });
});
