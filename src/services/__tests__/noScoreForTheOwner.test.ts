import { readFileSync } from 'fs';
import { join } from 'path';
import { asksForAScore, withoutScores, withPlainDigits } from '../noScores';

/** 3236 (ME-032, seat 179995): the owner was given a score, once in Gujarati digits. */
describe('digits are 0-9', () => {
  it('turns Gujarati, Persian and Arabic-Indic digits into 0-9', () => {
    expect(withPlainDigits('૮/૧૦')).toBe('8/10');
    expect(withPlainDigits('۱۲ ოქტომბერი')).toBe('12 ოქტომბერი');
    expect(withPlainDigits('٣ დღეში')).toBe('3 დღეში');
    expect(withPlainDigits('13 ოქტომბერი')).toBe('13 ოქტომბერი');
  });
});

describe('no score for the owner', () => {
  it('knows the ask', () => {
    expect(asksForAScore('შენი აზრით, როგორი ადამიანი ვარ? შემაფასე ქულით.')).toBe(true);
    expect(asksForAScore('Rate my networking skills from 1 to 10')).toBe(true);
    expect(asksForAScore('რა ტიპის ნეთვორქერი ვარ?')).toBe(false);
  });

  it('drops the sentence that gives a score and keeps the observation', () => {
    expect(withoutScores('პირველი შთაბეჭდილებით, 8/10. პირდაპირი ხარ და საქმეზე გადადიხარ.')).toBe(
      'პირდაპირი ხარ და საქმეზე გადადიხარ.',
    );
    expect(
      withoutScores('My early read is 6/10, deliberate and selective. You ask before you act.'),
    ).toBe('You ask before you act.');
  });

  it('drops a type pinned on the owner in place of the score (47978, 46816)', () => {
    const reply =
      'შენ პრაქტიკული ნეთვორქერი ჩანხარ.\n\nკავშირებს ძირითადად მაშინ იყენებ, როცა კონკრეტული საქმე გაქვს მოსაგვარებელი. ' +
      'შენთვის მნიშვნელოვანია სანდოობა და ხარისხი. მოკლედ, შედეგზე ორიენტირებული ადამიანი ხარ ნეთვორქში.';
    const kept = withoutScores(reply);
    expect(kept).not.toMatch(/ჩანხარ|ადამიანი ხარ/u);
    expect(kept).toContain('კავშირებს ძირითადად მაშინ იყენებ');
    expect(kept).toContain('შენთვის მნიშვნელოვანია სანდოობა და ხარისხი.');
    expect(withoutScores('You come across as a practical networker. You ask before you act.')).toBe(
      'You ask before you act.',
    );
  });

  it('drops the trace a dropped score leaves (47978, 46817)', () => {
    const reply =
      'You are willing to use your network for practical help, which is the core habit. ' +
      'I do not yet have enough evidence of how you build relationships to rate you higher with confidence.';
    expect(withoutScores(reply)).toBe(
      'You are willing to use your network for practical help, which is the core habit.',
    );
  });

  it('drops a bare „N 10-დან" too (47991, conv 46829)', () => {
    expect(
      withoutScores('ჩემი პირველი შთაბეჭდილებით, 8,5  10-დან. პირდაპირი ხარ და საქმეზე გადადიხარ.'),
    ).toBe('პირდაპირი ხარ და საქმეზე გადადიხარ.');
    expect(withoutScores('7 ათიდან. პირდაპირი ხარ.')).toBe('პირდაპირი ხარ.');
  });

  it('leaves a reply with no score alone', () => {
    const reply = 'პირდაპირი ხარ. 3 დღეში დაგიბრუნდები.';
    expect(withoutScores(reply)).toBe(reply);
  });

  it('runs on every reply, the score rule only when the owner asked to be rated', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('finalText = withPlainDigits(finalText);');
    expect(chat).toContain("if (!ownerAbsent && asksForAScore(runOwnerLine.get(runId) ?? '')) {");
  });
});
