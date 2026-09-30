import { readFileSync } from 'fs';
import { join } from 'path';
import { ALREADY_ON_CARD, isAnswerCardEvent, withoutEarlySolvedCard } from '../answerCardGuard';
import { buildShownAnswersWakeEvent, buildShownRelayAnswerWakeEvent } from '../taskAsks.service';

const solved = (label: string): boolean => /მოგვარ|solved/i.test(label);

/**
 * Tester 907 / D531: under the relay card the run asked „does this solve it?"
 * with „მოგვარებულია / ჯერ არა" — Test 74 had only agreed.
 */
describe('no „solved?" under an answers card', () => {
  it('recognises both card events, and only those', () => {
    const direct = `[მოვლენა] ${buildShownAnswersWakeEvent([{ answer: 'კი', fromName: 'A', verbatim: true }])}`;
    const relayed = `[მოვლენა] ${buildShownRelayAnswerWakeEvent('Test 74', 'Test 75')}`;
    expect(isAnswerCardEvent(direct)).toBe(true);
    expect(isAnswerCardEvent(relayed)).toBe(true);
    expect(isAnswerCardEvent('რა ხდება ჩემს მიზანზე?')).toBe(false);
    expect(isAnswerCardEvent(`ციტატა: ${ALREADY_ON_CARD}`)).toBe(false);
  });

  it('takes the finish card off, and replaces a reply that was only the question', () => {
    const guarded = withoutEarlySolvedCard(
      'გითხარი, ეს წყვეტს საკითხს?',
      ['მოგვარებულია', 'ჯერ არა'],
      'ka',
      solved,
    );
    expect(guarded).toEqual({
      text: 'როცა ისაუბრებთ, მომწერე — მაშინ დავხურავ.',
      choices: undefined,
    });
  });

  it('keeps a real reply and the other buttons', () => {
    const text = 'Test 74 თანახმაა. გავუგზავნო გაცნობის თხოვნა?';
    const long = `${text} ${'დეტალი '.repeat(20)}`;
    const guarded = withoutEarlySolvedCard(
      long,
      ['გაცნობის თხოვნა გავუგზავნო', 'Solved', 'Not yet'],
      'en',
      solved,
    );
    expect(guarded?.text).toBe(long);
    expect(guarded?.choices).toEqual(['გაცნობის თხოვნა გავუგზავნო']);
  });

  it('leaves a reply with no finish card alone', () => {
    expect(withoutEarlySolvedCard('კარგი.', ['გაცნობის თხოვნა'], 'ka', solved)).toBeNull();
    expect(withoutEarlySolvedCard('კარგი.', undefined, 'ka', solved)).toBeNull();
  });

  it('is applied where the reply is assembled', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('isAnswerCardEvent(userMessage)');
    expect(chat).toContain(
      'withoutEarlySolvedCard(cleanedFinal, choices, language, isSolvedLabel)',
    );
  });
});

/** Tester 907: „write to Nino yourself" — the owner has no way to; the one who agreed introduces. */
describe('the next step under a relayed card', () => {
  const event = buildShownRelayAnswerWakeEvent('Netai Test 74', 'Netai Test 75');

  it('offers an introduction from the one who agreed, not a message the owner cannot send', () => {
    expect(event).toContain('request_introduction');
    expect(event).not.toContain('პირველი შეტყობინება თავად');
  });
});
