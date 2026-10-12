import { readFileSync } from 'fs';
import { join } from 'path';
import { searchVerdictOf } from '../searchVerdict';

/**
 * 2810 (AD-015): „კი, ზუსტად ეს მჭირდებოდა, მადლობა." after a search left the
 * search without an outcome, so successful searches read 0. The owner's own
 * next line now records it.
 */
describe('what the owner’s line says about the search just shown', () => {
  it('reads an acceptance', () => {
    expect(searchVerdictOf('კი, ზუსტად ეს მჭირდებოდა, მადლობა.')).toBe('accepted');
    expect(searchVerdictOf('კარგი, მადლობა!')).toBe('accepted');
    expect(searchVerdictOf('Yes, exactly who I needed')).toBe('accepted');
    expect(searchVerdictOf('Perfect, thanks')).toBe('accepted');
  });

  it('reads a refusal', () => {
    expect(searchVerdictOf('არა, ეს არ არის ის, ვინც მჭირდება')).toBe('refused');
    expect(searchVerdictOf('Not what I needed')).toBe('refused');
  });

  it('says nothing about a bare yes, a question, or a long message', () => {
    expect(searchVerdictOf('კი')).toBeNull();
    expect(searchVerdictOf('კი, მაგრამ ვინ არის?')).toBeNull();
    expect(searchVerdictOf('მადლობა')).toBeNull();
    expect(
      searchVerdictOf(`კი, ზუსტად. ${'და კიდევ ერთი რამ მინდა გკითხო '.repeat(5)}`),
    ).toBeNull();
  });
});

describe('where it is read', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('runs before a thanks line can be answered by the server', () => {
    const hook = chat.indexOf('void recordSearchVerdict(userId, threadId, userMessage);');
    expect(hook).toBeGreaterThan(0);
    expect(hook).toBeLessThan(chat.indexOf('const thanksSettled ='));
  });

  it('never overwrites a rung the owner climbed', () => {
    const fn = chat.slice(chat.indexOf('export async function recordSearchVerdict'));
    expect(fn.slice(0, 900)).toContain('onlyIfUnset: true');
  });
});
