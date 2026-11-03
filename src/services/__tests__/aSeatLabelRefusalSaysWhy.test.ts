import { readFileSync } from 'fs';
import { join } from 'path';
import { BAD_TAG_DETAIL, isAcceptableTag } from '../seatContacts.service';

/** #8650 (the tester's 3 Nov check): a refused label says the rule. */
describe('a refused seat label says why', () => {
  it('names the limit and the comma', () => {
    expect(BAD_TAG_DETAIL).toContain('40');
    expect(BAD_TAG_DETAIL).toContain('comma');
    expect(isAcceptableTag('TBC ბანკი, საკრედიტო ოფიცერი')).toBe(false);
  });

  it('is sent by both the single and the bulk route', () => {
    const one = readFileSync(join(__dirname, '..', 'seatContacts.service.ts'), 'utf8');
    const bulk = readFileSync(join(__dirname, '..', 'seatContactsBulk.service.ts'), 'utf8');
    expect(one).toContain("refusal: 'bad_tag', detail: BAD_TAG_DETAIL");
    expect(bulk).toContain("refusal: 'bad_tag', index, detail: BAD_TAG_DETAIL");
  });
});
