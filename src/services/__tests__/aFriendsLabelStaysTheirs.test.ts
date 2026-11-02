import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * #8528 (the tester's 80752 item 14, case 61; Misho's yes, 2 Nov): a
 * second-degree row gave the friend's own label beside the person's registered
 * name, and the assistant said „Levan saved this person as Nino, but on Netai
 * it is Giorgi" — how another member keeps somebody in their phonebook (D523).
 */
describe('a friend’s label for somebody', () => {
  const tool = readFileSync(join(__dirname, '..', 'tools', 'searchSecondDegree.ts'), 'utf8');

  it('reaches the run only for a person with no registered name', () => {
    const at = tool.indexOf('knows_them_as: nameOnlyFromLabel(');
    expect(at).toBeGreaterThan(-1);
    const guard = tool.slice(Math.max(0, at - 200), at);
    expect(guard).toContain('row.own_name === null &&');
  });

  it('is never the shown name of a member who gave their own', () => {
    expect(tool).toContain('const shownName = row.own_name ?? bridgeName;');
  });
});
