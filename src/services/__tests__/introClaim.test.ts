import { readFileSync } from 'fs';
import { join } from 'path';
import { INTRO_CLAIM_GUARD_ON, introClaimWithoutSend, introNotSentLine } from '../introClaim';
import type { RunLanguage } from '../runLanguage';

const LANGUAGES: readonly RunLanguage[] = ['ka', 'en', 'ru', 'es'];

/** 4258 (box 50524, conv 48945): a goal thread said „sent" for an introduction it never asked for. */
describe('an introduction request said to be sent', () => {
  it.each([
    'ბახვა გამოგონილის მეშვეობით თამთა გამოგონილთან გაცნობის მოთხოვნა გავგზავნე.',
    'ბახვა გამოგონილს თამთა გამოგონილთან გაცნობის მოთხოვნა ახლა გავუგზავნე.',
    'გავუგზავნე გაცნობის თხოვნა ბახვას.',
    'I have sent the introduction request to Bakhva.',
    'The introduction request was sent to Bakhva.',
  ])('is caught when nothing went: %s', (reply) => {
    expect(introClaimWithoutSend(reply, false)).toBe(true);
  });

  it('is left alone when request_introduction succeeded in the run', () => {
    expect(introClaimWithoutSend('გაცნობის მოთხოვნა გავგზავნე.', true)).toBe(false);
  });

  it.each([
    'გაცნობის მოთხოვნა ვერ გავუგზავნე — ბახვა ჯერ არ შემოსულა.',
    'გაცნობის მოთხოვნა არ გაიგზავნა.',
    'I have not sent the introduction request yet.',
    'ლევანს, ნინოს და დათოს უკვე მივწერე.',
    'თამთაზე ბახვასგან გაცნობასაც მოვითხოვ.',
  ])('does not read a refusal, an ask or a promise as a sent request: %s', (reply) => {
    expect(introClaimWithoutSend(reply, false)).toBe(false);
  });
});

describe('the truth the owner reads instead', () => {
  it.each(LANGUAGES)('has a line and a confirm button in %s', (language) => {
    const line = introNotSentLine(language);
    expect(line.text.length).toBeGreaterThan(0);
    expect(line.confirm.length).toBeGreaterThan(0);
  });

  it('is on, on Misho’s yes to the exact lines (§125)', () => {
    expect(INTRO_CLAIM_GUARD_ON).toBe(true);
  });

  it('reads the run’s own successful request, after the offer guard', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('introClaimWithoutSend(finalText, runIntroSent.has(runId))');
  });
});
