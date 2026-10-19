import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The tester's 68868: Keti holds two orthopedists with the same label; the plain
 * number came back „listed as a doctor", the MEMBER as „specialty not on his
 * profile" — a member's row carried his own name, and the role was read from it.
 * Misho, 19 Oct: others' labels are said, without the author.
 */
describe('a friend’s label on a member is read for his role', () => {
  const source = readFileSync(join(__dirname, '..', 'searchSecondDegree.ts'), 'utf8');

  it('reads the bridge’s label apart from the member’s own name', () => {
    expect(source).toContain(
      'MAX(ua_t.alias)                                                  AS saved_label,',
    );
    expect(source).toContain('saved_label: string | null;');
  });

  it('takes the role from that label, for members and everyone else alike', () => {
    expect(source).toContain('label: r.saved_label ?? r.name,');
    expect(source).toContain('const labelled = row.saved_label ?? row.name;');
    expect(source).toContain('labelRoles.get(labelled)');
  });

  it('still says the name a member gave, never the label', () => {
    expect(source).toContain('name: row.own_name ?? nameOnlyFromLabel(row.name),');
  });
});
