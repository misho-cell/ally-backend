import { readFileSync } from 'fs';
import { join } from 'path';
import { withMemberChains } from '../tools/findWarmPath';
import { WALK_AFTER_FINDING_THEM, peopleFoundIn, walkTargetPhone } from '../warmPathAfterSearch';

/**
 * 3732 (box 52742): a person asked for by name is walked to after the search
 * finds them. #8779 group 4: no word list forces the walk any more — the rule
 * is find_warm_path's own description, and the model reads the owner's line.
 */
describe('3732: the walk after a search found the person', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('is said in find_warm_path’s description', () => {
    expect(WALK_AFTER_FINDING_THEM).toContain('call this next');
    const tool = chat.slice(chat.indexOf("name: 'find_warm_path',"));
    expect(tool.slice(0, 1500)).toContain('WALK_AFTER_FINDING_THEM,');
  });

  it('is never forced by a word match', () => {
    expect(chat).not.toContain('walksToTheNamedPerson');
    expect(chat).not.toContain('forceTool: WARM_PATH_TOOL');
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
