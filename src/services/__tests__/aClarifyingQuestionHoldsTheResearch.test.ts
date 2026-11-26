/**
 * Misho, 26 Nov (point 1): Netai asks before the task starts. The full research
 * does not start on a request Netai has just asked about; it starts with the
 * owner's answer.
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

  it('holds the research until the owner answers, then gives it back once with the answer', () => {
    noteAskedBeforeSearching(THREAD, NOW);
    expect(waitsOnTheOwnersAnswer(THREAD, NOW + 1_000)).toBe(true);
    holdResearch(THREAD, RESEARCH, NOW);
    const back = ownerAnsweredTheQuestion(THREAD, 'for my son, 10 years old', NOW + 60_000);
    expect(back?.ownerLine).toBe('find me a snowboard trainer\nfor my son, 10 years old');
    expect(back?.words).toBe('snowboard trainer');
    expect(back?.taskId).toBe(9);
    expect(waitsOnTheOwnersAnswer(THREAD, NOW + 60_000)).toBe(false);
    expect(ownerAnsweredTheQuestion(THREAD, 'again', NOW + 61_000)).toBeNull();
  });

  it('does not hold forever', () => {
    noteAskedBeforeSearching(THREAD, NOW);
    expect(waitsOnTheOwnersAnswer(THREAD, NOW + HELD_RESEARCH_MS)).toBe(false);
    holdResearch(THREAD, RESEARCH, NOW);
    expect(ownerAnsweredTheQuestion(THREAD, 'late', NOW + HELD_RESEARCH_MS)).toBeNull();
  });

  it('is marked at the run’s end, checked before the research, released by the owner’s line', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('askedBeforeSearching(finalText, toolNamesUsed)');
    expect(chat).toContain('if (waitsOnTheOwnersAnswer(threadId)) {');
    expect(chat).toContain(
      'holdResearch(threadId, { userId, taskId, words, ownerLine, askedAt });',
    );
    expect(chat).toContain('const held = ownerAnsweredTheQuestion(threadId, userMessage);');
    expect(chat).toMatch(/if \(!userMessage\.startsWith\(RUN_EVENT_PREFIX\)\) \{\s*const held/u);
  });
});
