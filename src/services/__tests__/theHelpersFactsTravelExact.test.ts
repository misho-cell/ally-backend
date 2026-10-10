jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { factsOf, missingFacts, missingFactsRefusal } from '../answerFacts';
import { withoutQuotedCopy } from '../replyGuards';

/**
 * D648 (the founder, box 37654): no quotation in either direction, and the
 * facts stay exact. The helper's answer goes in the assistant's words; every
 * name, number, price, time, date, address and link reaches the asker unchanged.
 */
describe('the facts of a helper’s line', () => {
  it('are names, numbers, prices, times, addresses, links and brand words', () => {
    const line =
      'ნანა ბერიძე კარგი სტომატოლოგია, ვაჟა-ფშაველას გამზ. 26, ფასი 50 ლარი, ხუთშაბათს 12:00-ზე. https://dent.ge Smile Clinic';
    const written = factsOf(line).map((f) => f.written);
    expect(written).toEqual(
      expect.arrayContaining([
        'ნანა',
        'ბერიძე',
        '26',
        '50',
        '12:00',
        'https://dent.ge',
        'Smile',
        'Clinic',
      ]),
    );
  });

  it('in a line written in Latin letters, are the capitalised names, not every word (1159)', () => {
    expect(
      factsOf('Baxva Gamogonili, my daughter had lessons with him, great tutor.').map(
        (f) => f.written,
      ),
    ).toEqual(['Baxva', 'Gamogonili']);
  });

  it('leave a phone number to the number tool', () => {
    expect(factsOf('მისი ნომერია 599123456').map((f) => f.written)).not.toContain('599123456');
  });
});

describe('an answer in the assistant’s words', () => {
  const helper = 'ნანა ბერიძე, სტომატოლოგი, ფასი 50 ლარი';

  it('passes when it keeps every fact, in any case form and order', () => {
    expect(missingFacts(helper, 'გირჩევს სტომატოლოგ ნანა ბერიძეს — 50 ლარი ღირს.')).toEqual([]);
  });

  it('is refused with the lost or changed facts named', () => {
    expect(missingFacts(helper, 'გირჩევს ნანას, ფასი დაახლოებით 60 ლარია.')).toEqual([
      'ბერიძე',
      '50',
    ]);
    expect(missingFactsRefusal(['ბერიძე', '50'])).toContain('include exactly: ბერიძე, 50');
  });

  it('has nothing to keep from a line with no facts', () => {
    expect(missingFacts('არ ვიცი, სამწუხაროდ.', 'სამწუხაროდ, არავის იცნობს.')).toEqual([]);
  });
});

describe('the send', () => {
  const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');

  it('no longer puts the helper’s own line in place of the assistant’s wording (#34 is gone)', () => {
    expect(asks).not.toContain('helpersOwnWording');
    expect(asks).toContain(
      'const heldBack = await answerHeldBack(askThreadId, row.question, answerText);',
    );
    expect(asks).toContain('if (missing.length > 0) return missingFactsRefusal(missing);');
  });

  it('never quotes a new answer to the owner', () => {
    const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');
    expect(engine).not.toContain('answerIsTheirOwnWords');
    expect(asks).toContain('const verbatim = false;');
  });
});

describe('the helper’s reply after the send', () => {
  it('says it went without repeating the words', () => {
    expect(withoutQuotedCopy('ნოდარს გადავეცი: „ნანა სტომატოლოგი".')).toBe('ნოდარს გადავეცი.');
    expect(withoutQuotedCopy('გადავეცი — "კი, ვიცნობ".')).toBe('გადავეცი.');
    expect(withoutQuotedCopy('გადავეცი, მადლობა.')).toBe('გადავეცი, მადლობა.');
  });
});

/** 3763 (box 48564, ask 18052): the helper's „ზაზა გამოგონილი" reached the owner as „ზაზას". */
describe('a surname the helper wrote', () => {
  it('is held to the answer when it ends in -ილი, -ური or -ული', () => {
    expect(
      missingFacts(
        'კი, ზაზა გამოგონილი, ვაკეში მუშაობს, ძალიან კარგია.',
        'ზაზას იცნობს, ვაკეში მუშაობს სანტექნიკოსად და ძალიან კარგია.',
      ),
    ).toEqual(['გამოგონილი']);
    expect(missingFacts('გიორგი გოგოლაური კარგი ხელოსანია.', 'გიორგის გირჩევს.')).toEqual([
      'გოგოლაური',
    ]);
  });

  it('is kept in any case ending', () => {
    expect(
      missingFacts(
        'კი, ზაზა გამოგონილი, ვაკეში მუშაობს.',
        'ზაზა გამოგონილს იცნობს, ვაკეში მუშაობს.',
      ),
    ).toEqual([]);
  });
});
