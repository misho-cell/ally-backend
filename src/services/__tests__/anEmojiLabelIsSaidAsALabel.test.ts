import { nameToSay } from '../spokenName';
import { AskState, ownerAskLine } from '../askState';
import { AskTap, askTapLineForAsker } from '../askOpening';

/** Row 283 (tester 42406): the fixed lines said „💙: asked" — a label with no letter is not a name. */
describe('a label with no letter in it', () => {
  it('is said as a saved label, in every language', () => {
    expect(nameToSay('💙', 'ka')).toBe('შენი კონტაქტი „💙"');
    expect(nameToSay('💙', 'en')).toBe('Your contact saved as 💙');
    expect(nameToSay('💙', 'ru')).toBe('Ваш контакт «💙»');
    expect(nameToSay('💙', 'es')).toBe('Tu contacto guardado como 💙');
  });

  it('leaves a name with a letter as it is, emoji and all', () => {
    expect(nameToSay('Nino 🌸', 'en')).toBe('Nino 🌸');
    expect(nameToSay('ნინო', 'ka')).toBe('ნინო');
  });

  it('reaches the status lines and the tap lines', () => {
    expect(ownerAskLine('💙', { status: 'sent' }, AskState.Sent, 'en')).toContain(
      'Your contact saved as 💙',
    );
    expect(askTapLineForAsker(AskTap.Later, 'ka', '💙')).toBe(
      'შენი კონტაქტი „💙" მოგვიანებით გიპასუხებს.',
    );
  });
});
