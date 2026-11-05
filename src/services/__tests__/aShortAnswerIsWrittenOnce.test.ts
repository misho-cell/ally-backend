import { readFileSync } from 'fs';
import { join } from 'path';
import {
  SHORT_ANSWER_MAX_CHARS,
  SHORT_ANSWER_ON_TEST_SEATS_ONLY,
  shortAnswerStands,
} from '../shortAnswerStands';

const QUIET = { proposedAPlan: false, sentSomething: false, hasChoices: false };

/**
 * #8524 (the tester's 80752 item 10, case 77): about half of a 34-second answer
 * was the same short answer written twice.
 */
describe('a short answer', () => {
  it('stands as Claude wrote it when the run planned and sent nothing', () => {
    expect(
      shortAnswerStands('ნიკა ბერიძე თიბისი ბანკის ანალიტიკოსად არის მითითებული.', QUIET),
    ).toBe(true);
  });

  it('is rewritten as before when it is long, planned, sent, carries choices or is empty', () => {
    expect(shortAnswerStands('ა'.repeat(SHORT_ANSWER_MAX_CHARS + 1), QUIET)).toBe(false);
    expect(shortAnswerStands('მოკლე', { ...QUIET, proposedAPlan: true })).toBe(false);
    expect(shortAnswerStands('მოკლე', { ...QUIET, sentSomething: true })).toBe(false);
    expect(shortAnswerStands('მოკლე', { ...QUIET, hasChoices: true })).toBe(false);
    expect(shortAnswerStands('   ', QUIET)).toBe(false);
  });

  it('is on for everyone since RETEST-4, and only skips the rewrite', () => {
    expect(SHORT_ANSWER_ON_TEST_SEATS_ONLY).toBe(false);
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'let rewritten = keepShort ? null : await (earlyFinal ?? writeWith(writer));',
    );
    expect(chat).toContain('allAreTestSeats([Number(userId)])');
  });
});
