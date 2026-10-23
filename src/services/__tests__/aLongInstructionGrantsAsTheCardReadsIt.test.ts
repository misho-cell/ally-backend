/**
 * #7228 (audit, 63430): a 213-character line naming Teona and telling Netai
 * what to say to her was an instruction to the approve wall (D625) and „nothing
 * reads as a yes" to grant_task_permission. Both walls read it the same way.
 */
import { ownerWordsGrantPermission } from '../chat.service';

const LONG_INSTRUCTION =
  'ასევე თეონა მაკალათიას უთხარი რომ ეგეთი ტიპის ინფორმაცია შეიძლება ქონდეს მოსავლის ' +
  'დირექტორს და დამფუძნებელს ირაკლი ჩხაიძეს. თუ ირაკლის თვითონ არ იცნობს, მე შეიძლება ' +
  'მოვძებნო მასთან გზები';

describe('grant_task_permission reads a long line by its instruction sentence', () => {
  it('reads the 63430 line, followed by a short note, as the owner’s word', () => {
    expect(LONG_INSTRUCTION.length).toBeGreaterThan(160);
    expect(
      ownerWordsGrantPermission('ესეც იგივე თემას ეხება. ღვინის კომპანიას', [LONG_INSTRUCTION]),
    ).toBe(true);
  });

  it('does not read a long line that only asks to see the message first', () => {
    const preview =
      'თეონა მაკალათიას რასაც მისწერ ჯერ მაჩვენე, მინდა ვნახო როგორ ჟღერს, იმიტომ რომ ' +
      'ძალიან ფრთხილად უნდა ვიყოთ ამ თემაზე და ირაკლი ჩხაიძის სახელი არ უნდა ეწეროს';
    expect(ownerWordsGrantPermission(preview, [])).toBe(false);
  });

  it('does not read a long line whose instruction is negated', () => {
    const negated =
      'ნოდარს და ლიკუნას მაგაზე არ დაუკავშირდე, სანამ არ მეტყვი მაგათ რა კავშირი აქვთ ჩემ ' +
      'პრობლემასთან? ღვინოსთან და სპირტიან სასმელთან აქვთ კავშირი? ტყუილად არ მიწერო';
    expect(ownerWordsGrantPermission(negated, [])).toBe(false);
  });

  it('does not read a short „don’t contact them" as an instruction either', () => {
    expect(ownerWordsGrantPermission('ნოდარს არ დაუკავშირდე', [])).toBe(false);
    expect(ownerWordsGrantPermission('ტყუილად არ მიწერო თეონას', [])).toBe(false);
    expect(ownerWordsGrantPermission('თეონას მისწერე, თუ არ იცნობს ირაკლის, მე ვიპოვი', [])).toBe(
      true,
    );
  });
});
