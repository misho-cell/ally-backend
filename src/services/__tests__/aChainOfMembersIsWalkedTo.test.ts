import { asksForAPersonByName } from '../personByName';
import { withMemberChains } from '../tools/findWarmPath';
import {
  peopleFoundIn,
  walksToTheNamedPerson,
  walkTargetPhone,
  WARM_PATH_TOOL,
} from '../warmPathAfterSearch';

/** 3732 (box 52742): the tester's own line, on both fictional chains. */
const TESTER_LINE = 'მინდა ნინო გამოგონილს დავუკავშირდე. ვისი გავლით შემიძლია?';

function round(overrides: Partial<Parameters<typeof walksToTheNamedPerson>[0]> = {}): boolean {
  return walksToTheNamedPerson({
    ownerLine: TESTER_LINE,
    toolsUsed: ['search_contact_by_name', 'search_second_degree'],
    roundTools: ['search_second_degree'],
    walkOffered: true,
    roundFoundSomeone: true,
    ...overrides,
  });
}

describe('3732: a person asked for by name is walked to after the search finds them', () => {
  it('reads „დავუკავშირდე … ვისი გავლით" as asking for a person by name', () => {
    expect(asksForAPersonByName(TESTER_LINE)).toBe(true);
    expect(asksForAPersonByName('Through whom can I reach Nino Gamogonili?')).toBe(true);
  });

  it('still reads a trade as a trade, so the web stays on for it', () => {
    expect(asksForAPersonByName('მინდა ბუღალტერს დავუკავშირდე')).toBe(false);
  });

  it('walks next, once a search round has run', () => {
    expect(round()).toBe(true);
  });

  it('does not walk before any search has found the person', () => {
    expect(round({ roundTools: ['get_my_tasks'], toolsUsed: ['get_my_tasks'] })).toBe(false);
  });

  // Box 52781: forced after a name search that found nobody, the walk got the name and no phone.
  it('does not walk after a search round that found nobody', () => {
    expect(round({ roundTools: ['search_contact_by_name'], roundFoundSomeone: false })).toBe(false);
  });

  it('walks once only', () => {
    expect(round({ toolsUsed: ['search_second_degree', WARM_PATH_TOOL] })).toBe(false);
  });

  it('never forces a tool the run does not hold', () => {
    expect(round({ walkOffered: false })).toBe(false);
  });

  it('leaves a line that asks for no person alone', () => {
    expect(round({ ownerLine: 'ვინ არის ჩემს კონტაქტებში იურისტი?' })).toBe(false);
  });
});

describe('3732: the members chain sits beside the graph paths', () => {
  it('appends a member chain the graph did not return', () => {
    expect(withMemberChains([['b3']], [['b1', 'b2']])).toEqual([['b3'], ['b1', 'b2']]);
  });

  it('never repeats a path the graph already gave', () => {
    expect(withMemberChains([['b1']], [['b1'], ['b1', 'b2'], ['b1', 'b2']])).toEqual([
      ['b1'],
      ['b1', 'b2'],
    ]);
  });
});

describe('3732: the walk takes the phone of the person this run found', () => {
  const found = peopleFoundIn({
    results: [
      { phone: 'p-target', name: 'მანანა სამიზნიშვილი' },
      { phone: 'p-other', name: 'სხვა ადამიანი' },
      { name: 'no phone here' },
    ],
  });

  it('reads the people a search returned, skipping rows with no phone id', () => {
    expect(found).toEqual([
      { phone: 'p-target', name: 'მანანა სამიზნიშვილი' },
      { phone: 'p-other', name: 'სხვა ადამიანი' },
    ]);
  });

  it('turns the name the model passed into that person’s phone id', () => {
    expect(walkTargetPhone(' მანანა სამიზნიშვილი ', found)).toBe('p-target');
  });

  it('keeps a phone id the model passed as it is', () => {
    expect(walkTargetPhone('p-other', found)).toBe('p-other');
  });

  it('never resolves a name the run was not shown, or one two people share', () => {
    expect(walkTargetPhone('უცნობი', found)).toBe('უცნობი');
    const twins = [
      { phone: 'a', name: 'ნინო' },
      { phone: 'b', name: 'ნინო' },
    ];
    expect(walkTargetPhone('ნინო', twins)).toBe('ნინო');
  });
});
