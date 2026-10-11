import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Ops, 11 Oct 13:42Z, from the live logs: two queries cast to the wrong column
 * type, so Postgres refused them on every call — `GET /members/:id` answered
 * 500 („text = integer": user_profile_kv.user_id is TEXT), and the plan-step
 * tidy-up never removed a step („uuid = integer": conversations.id is a UUID).
 */
const source = (file: string): string => readFileSync(join(__dirname, '..', file), 'utf8');

describe('the casts match the columns', () => {
  it('reads a member’s profile by a text user_id', () => {
    const card = source('memberCard.service.ts');
    expect(card).toContain('WHERE user_id = $1::text AND key = ANY($2::text[])');
    expect(card).toContain('[String(memberId), PROFILE_KEYS, PROFILE_KEYS.length]');
  });

  it('deletes plan steps by their uuid ids', () => {
    const chat = source('chat.service.ts');
    expect(chat).toContain('DELETE FROM conversations WHERE id = ANY($1::uuid[])');
    expect(chat).not.toContain('DELETE FROM conversations WHERE id = ANY($1::int[])');
  });
});
