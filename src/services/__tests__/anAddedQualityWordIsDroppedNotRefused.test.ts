import { readFileSync } from 'fs';
import { join } from 'path';
import { factChangedIn, withoutQualityNotSaid } from '../factKeeping';

/**
 * 0267 day one (58044): „Not sent: it adds „სანდო", a detail the owner did not
 * give" cost a model round each time. The word is dropped by the server and the
 * ask goes on; every other fact check stays a refusal.
 */
const OWNER = ['კარგი სანტექნიკოსი მჭირდება თბილისში.'];

describe('an added quality word is dropped, not refused', () => {
  it('drops „სანდო" the owner never wrote, and the question then passes', () => {
    const asked = 'სანდო სანტექნიკოსს ხომ არ იცნობ თბილისში?';
    expect(factChangedIn(asked, OWNER)).not.toBeNull();
    const question = withoutQualityNotSaid(asked, OWNER);
    expect(question).toBe('სანტექნიკოსს ხომ არ იცნობ თბილისში?');
    expect(factChangedIn(question, OWNER)).toBeNull();
  });

  it('keeps the word when the owner wrote it', () => {
    const owner = ['სანდო სანტექნიკოსი მჭირდება.'];
    expect(withoutQualityNotSaid('სანდო სანტექნიკოსს ხომ არ იცნობ?', owner)).toBe(
      'სანდო სანტექნიკოსს ხომ არ იცნობ?',
    );
  });

  it('still refuses a beneficiary the owner never named', () => {
    const asked = 'ჩემს მეგობარს სანტექნიკოსი სჭირდება, ხომ არ იცნობ?';
    expect(factChangedIn(withoutQualityNotSaid(asked, OWNER), OWNER)).not.toBeNull();
  });

  it('runs before the checks in ask_contact', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const ask = chat.slice(chat.indexOf("case 'ask_contact': {"));
    const strip = ask.indexOf('const question = withoutQualityNotSaid(asked, ownerLines);');
    expect(strip).toBeGreaterThan(-1);
    expect(strip).toBeLessThan(ask.indexOf('const changed = factChangedIn(question, ownerLines);'));
  });
});
