import { readFileSync } from 'fs';
import { join } from 'path';
import { latinLabelNamedInGeorgian } from '../namedLabel';

/**
 * Giorgi, 29 Oct (thread 74052): „აბა თორნიკესაც კითხე" — „which Tornike?" —
 * „აბულაძეს" — „გაუგზავნე". No single line named the person, so the ask, the
 * plan and the permission walls refused one another. The owner's last lines
 * are read together.
 */
const service = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
const helper = service.slice(service.indexOf('async function namedAcrossRecentLines('));
const body = helper.slice(0, helper.indexOf('\n}\n'));

describe('an instruction carried over two lines (Giorgi, 29 Oct)', () => {
  it('names the person when the lines are read together, not the first alone', () => {
    const first = 'სანამ ლიკას ვუპასუხებთ, აბა თორნიკესაც კითხე';
    expect(latinLabelNamedInGeorgian(first, 'tornike abuladze')).toBe(false);
    expect(
      latinLabelNamedInGeorgian(`${first} აბულაძეს რატო ? გაუგზავნე`, 'tornike abuladze'),
    ).toBe(true);
  });

  it('starts at the latest instruction and stops at a line that takes it back', () => {
    expect(body).toContain('if (looksLikeContactInstruction(line)) from = i;');
    expect(body).toContain('after.some((line) => TAKEN_BACK_RE.test(line))');
    expect(service).toContain('if (await namedAcrossRecentLines(person)) return true;');
  });

  it('names a member the owner has not saved, by their own registered name (13:20)', () => {
    expect(
      latinLabelNamedInGeorgian('სალომეს კითხე მხოლოდ. ხო ფარქოსაძე', 'Salome Parkosadze'),
    ).toBe(true);
    const name = service.slice(service.indexOf('async function namesThisPerson('));
    expect(name.slice(0, name.indexOf('\n}\n'))).toContain(
      'if (await memberNameOfThisPersonNamed(line, person)) return true;',
    );
  });
});
