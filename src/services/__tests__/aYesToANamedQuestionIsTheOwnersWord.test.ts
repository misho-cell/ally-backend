import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * #7228 (the tester's audit, thread 63374): the assistant asked „ვაგზავნი
 * ომიკოსთან?", the owner answered „კი" — six times over the evening — and
 * every ask to Omiko was refused as outside the plan: the yes named nobody,
 * and the plan wall reads only a line or a tap that names the person.
 *
 * A bare yes to the assistant's own question that names exactly this person is
 * now the owner's word for that one ask. What must not loosen: the yes must be
 * the whole line, the assistant's line must be a question, and it must name
 * this one person by the same matcher the walls already use.
 */
const code = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
const helper = code.slice(code.indexOf('async function ownerJustNamedPerson'));

describe('a yes to the assistant’s question that names the person', () => {
  it('is read inside the one matcher both walls use', () => {
    const body = helper.slice(0, helper.indexOf('} catch (error)'));
    expect(body).toContain('BARE_YES_RE.test(tapped)');
    expect(body).toContain('await assistantQuestionBefore(person)');
    expect(body).toContain('await lineNamesThisPerson(asked, person)');
  });

  it('counts only a whole-line yes', () => {
    const source = code.slice(code.indexOf('const BARE_YES_RE'));
    const pattern = new RegExp(source.slice(source.indexOf('/') + 1, source.indexOf('/iu')), 'iu');
    for (const yes of ['კი', 'დიახ!', 'ვადასტურებ', 'ok']) expect(pattern.test(yes)).toBe(true);
    for (const not of ['კი, მაგრამ სხვას ჰკითხე', 'კიკიკიკიკი', 'არა'])
      expect(pattern.test(not)).toBe(false);
  });

  it('takes the assistant’s line only when it is a question', () => {
    const reader = code.slice(code.indexOf('async function assistantQuestionBefore'));
    expect(reader.slice(0, 1200)).toContain('/[?？]$/u.test(line) ? line : null');
  });
});
