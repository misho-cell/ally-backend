jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import {
  approvalBelongsToThePlan,
  canonicalChoiceLabel,
  choicesWithoutApproval,
  isApproveLabel,
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
