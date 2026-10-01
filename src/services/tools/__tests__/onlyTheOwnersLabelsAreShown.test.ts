import { readFileSync } from 'fs';
import { join } from 'path';
import { ownLabelsOnly } from '../getContactFullProfile';

/**
 * Row 289's second half — D539 („only my own labels") and D523 (never show how
 * another person saved a contact), the tester's 941: after the tag search, the
 * name search and the contact card follow the same line.
 */
describe('the contact card', () => {
  const rows = [
    { tag: 'ვეტერინარი', contributor_count: 3, total_weight: 5, own: true },
    { tag: 'deda nino', contributor_count: 1, total_weight: 1, own: false },
    { tag: 'gizhi levani', contributor_count: 1, total_weight: 1, own: false },
    { tag: 'x@y.ge', contributor_count: 1, total_weight: 1, own: false },
  ];

  it('shows the owner’s labels and only a count of everyone else’s', () => {
    const card = ownLabelsOnly(rows);
    expect(card.tags).toEqual([{ tag: 'ვეტერინარი', contributor_count: 3, total_weight: 5 }]);
    expect(card.others_labels_count).toBe(2);
    expect(JSON.stringify(card)).not.toContain('deda nino');
  });

  it('reads whose each label is by the owner’s id', () => {
    const profile = readFileSync(join(__dirname, '..', 'getContactFullProfile.ts'), 'utf8');
    expect(profile).toContain('BOOL_OR(ut."contactId" = $2)         AS own');
    expect(profile).toContain('[phone, userId]');
  });
});

describe('the name search', () => {
  it('uses the same own-labels line as the tag search, in both of its queries', () => {
    const byName = readFileSync(join(__dirname, '..', 'searchContactByName.ts'), 'utf8');
    expect(byName.match(/FILTER \(WHERE ut\."contactId" = \$1\) AS own_tags/g)).toHaveLength(2);
    expect(byName).toContain('tags: ownDisplayableTags(row),');
    expect(byName).toContain('found_by_others_labels: true');
  });
});
