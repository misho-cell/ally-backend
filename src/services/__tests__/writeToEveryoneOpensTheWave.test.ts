import { readFileSync } from 'fs';
import { join } from 'path';
import { asksToWriteToEveryone } from '../taskAsks.service';

/**
 * Misho's yes (22 Oct, Lasha's 63823): „ყველას მიწერე ვისაც ნეტაი აქვს", and
 * four of his people were held by the 3-per-wave rule. The owner's own line
 * asking to write to everyone now opens the wave for that ask.
 */
describe('„write to everyone" in the owner’s own words', () => {
  it.each([
    'ყველას მიწერე ვისაც ნეტაი აქვს',
    'ყველა ადამიანის ასისტენტს გაუგზავნე შეტყობინება',
    'please write to everyone',
  ])('opens the wave: %s', (line) => {
    expect(asksToWriteToEveryone(line)).toBe(true);
  });

  it.each(['ყველაზე კარგი ელექტრიკოსი მჭირდება', 'ყველას გამარჯობა', 'მიწერე ნიკას'])(
    'leaves it closed: %s',
    (line) => {
      expect(asksToWriteToEveryone(line)).toBe(false);
    },
  );

  it('is read only at the wave wall, beside the owner naming the person', () => {
    const code = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    const call = code.slice(code.indexOf('const room = await waveRoomFor('));
    expect(call.slice(0, 500)).toContain('await ownerAskedForEveryone({');
  });
});
