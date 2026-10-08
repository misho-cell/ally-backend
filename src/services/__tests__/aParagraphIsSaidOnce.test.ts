import { readFileSync } from 'fs';
import { join } from 'path';
import { withoutRepeatedParagraphs } from '../repeatedParagraphs';

const FOUND =
  'ბესო ფალავანდიშვილი საჯაროდ ვერ ვიპოვე, მაგრამ ნანა კობახიძე შენს კონტაქტებშია და ნეტაის იყენებს.';
const PLAN =
  'ნანას ასისტენტს დაველაპარაკები და შევეცდები მოვაგვარო, რომ ნანამ გაგაცნოს ბესოს. დავიწყო?';

/** 2909 (conv 44086): the same two paragraphs twice in one reply. */
describe('a reply that says its paragraphs twice', () => {
  it('keeps the first copy of each', () => {
    expect(withoutRepeatedParagraphs(`${FOUND}\n\n${PLAN}\n\n${FOUND}\n\n${PLAN}`)).toBe(
      `${FOUND}\n\n${PLAN}`,
    );
  });

  it('matches across spacing differences', () => {
    expect(withoutRepeatedParagraphs(`${FOUND}\n\n${PLAN}\n \n${PLAN.replace(' ', '  ')}`)).toBe(
      `${FOUND}\n\n${PLAN}`,
    );
  });

  it('leaves a reply without repeats, and short repeated lines, untouched', () => {
    const plain = `${FOUND}\n\n${PLAN}`;
    expect(withoutRepeatedParagraphs(plain)).toBe(plain);
    const short = 'კი.\n\nარა.\n\nკი.';
    expect(withoutRepeatedParagraphs(short)).toBe(short);
  });

  it('runs on every final reply', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('effectiveFinal = withoutRepeatedParagraphs(effectiveFinal);');
  });
});
