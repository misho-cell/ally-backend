import { knownDigits, mutualGroupsText, reachCounts } from '../mutualGroups';

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

describe('Giorgi, 9 Nov (case 1 #5, case 3): why these people', () => {
  it('names, for a kind of help, how many matching contacts each one holds', () => {
    const text = mutualGroupsText(
      'კოტეჯი ბაკურიანში',
      [
        { name: 'ბესო ორთოიძე', onNetai: true, matches: 3 },
        { name: 'ლევანი', onNetai: false, matches: 1 },
      ],
      'ka',
      true,
    );
    expect(text).toContain('ბესო ორთოიძე (3 შესაბამისი კონტაქტი)');
    expect(text).toContain('ლევანი (1 შესაბამისი კონტაქტი)');
  });

  it('adds nothing where there is no count — a named person’s heading already says why', () => {
    const text = mutualGroupsText('თემური', [{ name: 'ბესო', onNetai: true }], 'ka');
    expect(text).toContain('ბესო');
    expect(text).not.toContain('შესაბამისი');
  });

  it('counts each go-between once per person found', () => {
    const counts = reachCounts([
      { name: 'A', viaPhones: ['+995 555 000 111'] },
      { name: 'B', viaPhones: ['+995555000111', '+995555000222'] },
    ]);
    expect(counts.get('995555000111')).toBe(2);
    expect(counts.get('995555000222')).toBe(1);
  });
});
