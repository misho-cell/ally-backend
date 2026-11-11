import { knownDigits, mutualGroupsText } from '../mutualGroups';

/**
 * Giorgi's 9 Nov cases 2 and 3: a kind of help is not „known" by anyone, and
 * the go-between holding the most matching contacts is named first after the
 * plan's own go-betweens.
 */
describe('Giorgi’s cases 2 and 3', () => {
  it('heads a kind of help as help, a named person as known', () => {
    const contacts = [{ name: 'ლიკა', onNetai: true }];
    expect(mutualGroupsText('კოტეჯი', contacts, 'ka', true)).toContain(
      'ამაში შეიძლება დაგეხმარონ შენი ეს ნაცნობები:',
    );
    expect(mutualGroupsText('თემური', contacts, 'ka')).toContain('იცნობენ შენი ეს ნაცნობები:');
  });

  it('puts the plan’s go-betweens first, then the one reaching the most', () => {
    const found = [
      { name: 'A', viaPhones: ['111', '333'] },
      { name: 'B', viaPhones: ['333'] },
      { name: 'C', viaPhones: ['222', '333'] },
    ];
    expect(knownDigits(['999'], found)).toEqual(['999', '333', '111', '222']);
  });
});
