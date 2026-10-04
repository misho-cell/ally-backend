import { readFileSync } from 'fs';
import { join } from 'path';
import { approvedADraft, onlyPadsOwnLine, sharesMostWords } from '../taskAsks.service';

/**
 * #34 — the tester's 1055 (threads 31058 / 31062): the helper typed one word
 * order and their assistant sent another. Same words → the helper's own line goes.
 */
describe('the approved text against the helper’s own line', () => {
  const own = 'ორშაბათს 10-დან 14 საათამდე, მეორე სართულზე, 7 ნომერ კაბინეტში.';

  it('sees a rearranged copy as the same words', () => {
    expect(
      sharesMostWords(own, 'ორშაბათს 10-დან 14 საათამდე, მეორე სართულზე, კაბინეტი ნომერი 7.'),
    ).toBe(true);
  });

  it('does not take a confirmation or a different answer for the helper’s answer', () => {
    expect(sharesMostWords('კი, გაუგზავნე', 'ორშაბათს 10-დან 14 საათამდე იღებს')).toBe(false);
    expect(sharesMostWords(own, 'სამშაბათს მოდი, დილით.')).toBe(false);
  });
});

/** The tester's 1102 (j, 33151): „არ ვიცი." arrived as „არ ვიცი, სამწუხაროდ ვერ გეტყვი". */
describe('words added on the way', () => {
  it('are seen when the sent text keeps the whole of the helper’s line and adds to it', () => {
    expect(onlyPadsOwnLine('არ ვიცი.', 'არ ვიცი, სამწუხაროდ ვერ გეტყვი')).toBe(true);
    expect(onlyPadsOwnLine('No.', 'No, I am sorry, I cannot help with that.')).toBe(true);
  });

  it('are not seen when the sent text drops or changes the helper’s words', () => {
    expect(onlyPadsOwnLine('არ ვიცი, ნინომ იცის', 'არ ვიცი')).toBe(false);
    expect(onlyPadsOwnLine('კი, გაუგზავნე', 'ვიცნობ ფოტოგრაფს, გია')).toBe(false);
    expect(onlyPadsOwnLine('არ ვიცი.', 'არ ვიცი.')).toBe(false);
  });

  it('leave an approved draft as written', () => {
    const draft = 'კი, ვიცნობ კარგ ფოტოგრაფს, გიას.';
    expect(onlyPadsOwnLine('კი', draft)).toBe(true);
    expect(approvedADraft(`გავუგზავნო ასე: „${draft}"?`, draft)).toBe(true);
    expect(approvedADraft('რა ვუპასუხო?', draft)).toBe(false);
  });
});

/** The founder's D647 (the tester's 1144, 37520): a question back is never quoted. */
describe('a helper’s question back', () => {
  it('keeps the assistant’s wording instead of the helper’s own line', () => {
    const source = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    const fn = source.slice(source.indexOf('async function helpersOwnWording('));
    expect(fn.slice(0, fn.indexOf('\n}\n'))).toContain(
      'if (helperAskedAQuestion(own)) return approvedText;',
    );
  });
});
