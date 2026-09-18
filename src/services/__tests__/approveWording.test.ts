jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import {
  approvalBelongsToThePlan,
  canonicalChoiceLabel,
  choicesWithoutApproval,
  isApproveChoice,
  isApproveLabel,
  isChangeChoice,
  unrecognisedApproveHalf,
} from '../chat.service';

/**
 * Read from the base, 18 September, thread 17528 — an all-English conversation
 * whose stored plan card was:
 *
 *   choices = ["ვეთანხმები", "Change it"]
 *
 * The change half canonicalised to English correctly. The approve half did not,
 * because the stem list was the „amtkits / dadastur" family and „ვეთანხმები" is
 * „I agree" — a root it had never met. canonicalChoiceLabel passes through
 * anything it does not recognise, so the word was stored and shown as typed.
 *
 * The seat found it as a cosmetic fault: a Georgian button in an English
 * thread. It was not cosmetic. approvalBelongsToThePlan decides a plan card is
 * on screen by asking whether any offered choice IS an approve label, so an
 * unrecognised word made that false, and the owner's approval had nowhere left
 * to land.
 */
describe('the word the model used for approve on thread 17528', () => {
  it('is read as approval at all, which it was not', () => {
    expect(isApproveLabel('ვეთანხმები')).toBe(true);
  });

  it('is shown in the language of the conversation it was offered in', () => {
    expect(canonicalChoiceLabel('ვეთანხმები', 'en')).toBe('I approve');
    expect(canonicalChoiceLabel('ვეთანხმები', 'ka')).toBe('ვამტკიცებ');
    expect(canonicalChoiceLabel('ვეთანხმები', 'ru')).toBe('Подтверждаю');
  });

  it('lets a press of that button approve the plan', () => {
    // The button's label is sent as the owner's message, so this is the tap.
    expect(approvalBelongsToThePlan('ვეთანხმები', ['ვეთანხმები', 'Change it'])).toBe(true);
  });

  it('lets a bare „კი" approve it too, which it also did not', () => {
    // The bare-yes fallback is gated on a plan card being on screen, and the
    // card was invisible to that test — so BOTH ways in were shut, not one.
    expect(approvalBelongsToThePlan('კი', ['ვეთანხმები', 'Change it'])).toBe(true);
  });

  it('lets the approve button be stripped when nobody can be written to', () => {
    // Row 203 removes the approve button rather than discouraging it. A button
    // it cannot recognise is a button it cannot remove.
    expect(choicesWithoutApproval(['ვეთანხმები', 'შევცვალოთ'])).toEqual(['შევცვალოთ']);
  });

  it('still refuses the same word negated', () => {
    // „I do not agree". The pattern is anchored, so this needs no special case
    // — but it is the first thing that would break if somebody unanchored it.
    expect(isApproveLabel('არ ვეთანხმები')).toBe(false);
  });

  it('reads the other languages the model writes in', () => {
    for (const word of ['I agree', 'agreed', 'Согласен', 'De acuerdo', 'თანახმა ვარ']) {
      expect(isApproveLabel(word)).toBe(true);
    }
  });
});

/**
 * The stem list has now been short of a word twice — „შეცვლა" on 11 September
 * and „ვეთანხმები" on the 18th — and both times we found out from a button
 * that did nothing. It cannot be completed by guessing, so the next gap says
 * so on its own.
 */
describe('a plan card whose approve half was not recognised', () => {
  it('is spotted by the shape: a change label, and something that is nothing', () => {
    // Not „ვეთანხმები" — that one is in the list now. These stand for whatever
    // the model writes next that nobody has thought of.
    expect(unrecognisedApproveHalf(['კარგად ჟღერს', 'Change it'])).toBe('კარგად ჟღერს');
    expect(unrecognisedApproveHalf(['Sounds good', 'შევცვალოთ'])).toBe('Sounds good');
  });

  it('says nothing about a card that is fine', () => {
    expect(unrecognisedApproveHalf(['ვამტკიცებ', 'შევცვალოთ'])).toBeNull();
    expect(unrecognisedApproveHalf(['I approve', 'Change it'])).toBeNull();
    // And the live pair from 17528, which this fix makes ordinary — it is the
    // one case that must NOT warn any more.
    expect(unrecognisedApproveHalf(['ვეთანხმები', 'Change it'])).toBeNull();
  });

  it('does not cry about an ordinary two-option question', () => {
    // Row 203's replacement buttons: no change label, so not a plan card.
    expect(unrecognisedApproveHalf(['თვითონ დავურეკავ', 'მოწვევა გავაგზავნო'])).toBeNull();
    expect(unrecognisedApproveHalf(['Call them myself', 'Send an invitation'])).toBeNull();
  });

  it('says nothing when there are not exactly two choices', () => {
    expect(unrecognisedApproveHalf(['შევცვალოთ'])).toBeNull();
    expect(unrecognisedApproveHalf(['a', 'შევცვალოთ', 'c'])).toBeNull();
    expect(unrecognisedApproveHalf([])).toBeNull();
  });
});

/**
 * The Spanish run the seat reported as flawless — thread 17559, 12:01:47, zero
 * Georgian characters anywhere in it:
 *
 *   choices = ["Apruebo el plan", "Quiero cambiar algo"]
 *
 * Both unrecognised, for two different reasons. „Apruebo el plan" carries the
 * right stem and is three words, over the two-word cap; „Quiero cambiar algo"
 * carries its stem in second place and the pattern is anchored to the start.
 * So that plan had the same dead approve button as 17528 — flawless on
 * language, broken on function, by a mechanism the stem fix did not touch.
 *
 * The strictness is right where it came from: isApproveLabel also judges what
 * the OWNER typed, and there the anchor and the cap are what stop „I approve of
 * the first one but not Ninia" from approving a plan. A button is a different
 * thing — text the MODEL wrote onto a control, and a model writes a phrase.
 */
describe('a button the model wrote, as opposed to a sentence the owner typed', () => {
  it('reads the Spanish pair that came back unrecognised', () => {
    expect(isApproveChoice('Apruebo el plan')).toBe(true);
    expect(isChangeChoice('Quiero cambiar algo')).toBe(true);
  });

  it('canonicalises them, which is what makes the tap work later', () => {
    // The stored label becomes the canonical one, the button shows it, and the
    // tap sends it — so the STRICT matcher, unchanged, accepts the tap.
    expect(canonicalChoiceLabel('Apruebo el plan', 'es')).toBe('Lo apruebo');
    expect(canonicalChoiceLabel('Quiero cambiar algo', 'es')).toBe('Cambiarlo');
    expect(isApproveLabel(canonicalChoiceLabel('Apruebo el plan', 'es'))).toBe(true);
  });

  it('makes that plan approvable, which it was not', () => {
    expect(approvalBelongsToThePlan('Lo apruebo', ['Lo apruebo', 'Cambiarlo'])).toBe(true);
    // And the card is now visible to the bare-yes path too.
    expect(approvalBelongsToThePlan('sí', ['Lo apruebo', 'Cambiarlo'])).toBe(true);
  });

  it('refuses a button that opens with a negation', () => {
    // A model could plausibly offer „I do not agree". Unanchoring the stem
    // without this guard would read it as approval.
    for (const no of ['არ ვეთანხმები', 'No apruebo el plan', 'Not approved', 'не подтверждаю']) {
      expect(isApproveChoice(no)).toBe(false);
    }
  });

  it('leaves row 203 buttons alone, which carry no stem at all', () => {
    // Read from the live rows on 17558 and 17560.
    for (const label of [
      'თვითონ დავურეკავ',
      'სხვაც მოძებნე',
      'ხიდებს მოწვევა გავუგზავნო Netai-ზე',
      'თვითონ დავურეკავ ერთ-ერთს',
    ]) {
      expect(isApproveChoice(label)).toBe(false);
      expect(isChangeChoice(label)).toBe(false);
      expect(canonicalChoiceLabel(label, 'ka')).toBe(label);
    }
  });

  it('will not swallow a whole sentence that merely mentions approving', () => {
    // The permissiveness is bounded: a button is short. A sentence is not a
    // button, and this predicate must never be used on one.
    expect(isApproveChoice('I approve of the first one but not of Ninia at all')).toBe(false);
  });

  it('keeps the strict rule strict, because the owner types sentences', () => {
    expect(isApproveLabel('Apruebo el plan')).toBe(false);
    expect(isApproveLabel('Lo apruebo')).toBe(true);
  });
});
