import { readFileSync } from 'fs';
import { join } from 'path';
import { askIsTheIntroduction, ownerWantsNoGoBetween } from '../introInstruction';

/** Example 6 for Misho (a real member, 25 Oct): 13 refusals of a direct ask to Beso. */
const GOAL = 'გამაცანი ბესო ორთოიძე, movla.ge-ს გამწვანების პროექტისთვის';
const KNOWS = 'ბესოს მე პირადადაც ვიცნობ. არ მქონია მისი ნომერი დასეივებული. ახლა დავასეივე.';
const NO_MEDIATION = 'ეს არის ბესოს ნომერი და მაქვს უკვე კონტაქტებში. არ მინდა ბესოსთან შუამავლობა';

describe('an owner who knows the person asked for no introduction to them', () => {
  it('reads „I know him personally", „in my contacts" and „no go-between"', () => {
    expect(ownerWantsNoGoBetween([GOAL, KNOWS], 'ბესო ორთოიძე')).toBe(true);
    expect(ownerWantsNoGoBetween([GOAL, NO_MEDIATION], 'ბესო ორთოიძე')).toBe(true);
    expect(
      ownerWantsNoGoBetween(['I know him personally, Beso is fine to ask directly'], 'Beso'),
    ).toBe(true);
  });

  it('is about the person it names only', () => {
    expect(ownerWantsNoGoBetween([GOAL, 'ლუკას პირადად ვიცნობ'], 'ბესო ორთოიძე')).toBe(false);
  });

  it('leaves an ordinary introduction an introduction', () => {
    expect(askIsTheIntroduction([GOAL], 'ბესო ორთოიძე')).toBe(true);
    expect(ownerWantsNoGoBetween([GOAL], 'ბესო ორთოიძე')).toBe(false);
  });

  it('is asked before an ask is refused as an introduction', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      "!ownerWantsNoGoBetween(ownerLines, String(input['contact_name'] ?? '')) &&",
    );
  });
});
