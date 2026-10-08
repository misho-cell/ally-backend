import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 2939 (the tester's 45871): the day's question asked what „მაკა ბუღალტერი"
 * does, though her tag said accountant. A tag counts as the occupation.
 */
describe('the curiosity queue', () => {
  it('counts a tag on the contact as a known occupation', () => {
    const queue = readFileSync(join(__dirname, '..', 'curiosityQueue.service.ts'), 'utf8');
    expect(queue).toContain(`SELECT DISTINCT phone, 'occupation' AS field_type FROM "UserTags"`);
    expect(queue).toContain("WHERE phone = ANY($1) AND NULLIF(TRIM(tag), '') IS NOT NULL");
  });
});
