/**
 * Misho, 23 Oct (on the tester's 74020): Nika wrote „ასე მისწერე: …" and the
 * question was refused three times as „the owner's own words letter for
 * letter". Text the owner dictates goes as written; D648 holds for the rest.
 */
import { ownersLineQuoted } from '../factKeeping';
import { dictatesTheText } from '../sentenceCarriedOver';

const dictated =
  'ლაშა კურაშვილის მოთხოვნა რაც იყო ჩემთან, ასე მისწერე: რამდენიმე კონტაქტი შემიძლია ' +
  'გაგიზიარო, ვისაც შეგიძლია დაურეკო ჩემი სახელით.';
const message = 'რამდენიმე კონტაქტი შემიძლია გაგიზიარო, ვისაც შეგიძლია დაურეკო ჩემი სახელით.';

describe('text the owner dictates', () => {
  it('reads a dictation in Georgian and English', () => {
    expect(dictatesTheText(dictated)).toBe(true);
    expect(dictatesTheText('write him this: the meeting moved to Friday')).toBe(true);
  });

  it('is not a dictation without the writing verb and colon', () => {
    expect(dictatesTheText('ხვალ ვერ მოვალ, ძალიან დაკავებული ვარ.')).toBe(false);
  });

  it('lets the dictated sentence through', () => {
    expect(ownersLineQuoted(message, [dictated])).toBeNull();
  });

  it('still holds back a quoted sentence the owner did not dictate', () => {
    const own = 'ხუთშაბათს ვერ ვახერხებ, პარასკევს უფრო მოხერხებული იქნება ჩემთვის.';
    expect(ownersLineQuoted(own, [own])).not.toBeNull();
  });
});
