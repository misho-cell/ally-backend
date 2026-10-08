import { readFileSync } from 'fs';
import { join } from 'path';
import { claimsADeletion, deletionClaimWithoutTool, notDeletedLine } from '../deletionClaim';

/**
 * 3302 (MASTER TEST RUN ME-016 / PR-036): „…ჩანაწერი წავშალე" with no tool
 * called; the fact stayed. „Deleted" only when a deleting tool ran.
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('a deletion is claimed only when one happened', () => {
  it.each([
    'ავთოს ელექტრიკოსობის ჩანაწერი წავშალე.',
    'ეს ფაქტი წასაშლელად მოვნიშნე.',
    'Done, I deleted it.',
  ])('claims: %s', (reply) => {
    expect(claimsADeletion(reply)).toBe(true);
    expect(deletionClaimWithoutTool(reply, ['search_contact_by_name'])).toBe(true);
  });

  it('a deleting tool in the run makes the claim true', () => {
    expect(deletionClaimWithoutTool('ჩანაწერი წავშალე.', ['forget_contact_fact'])).toBe(false);
  });

  it('a reply that deletes nothing and says nothing of it is left alone', () => {
    expect(deletionClaimWithoutTool('ავთო ელექტრიკოსია.', [])).toBe(false);
  });

  it('the owner reads the truth and a confirm button', () => {
    expect(notDeletedLine('ka')).toEqual({
      text: 'ეს ჯერ არ წამიშლია. დამიდასტურე და ახლავე წავშლი.',
      confirm: 'კი, წაშალე',
    });
    expect(chat).toContain(
      'if (!ownerAbsent && deletionClaimWithoutTool(finalText, toolNamesUsed)) {',
    );
    expect(chat).toContain('choices = [notDeleted.confirm];');
  });
});

describe('a removal said in other words (the tester’s 47061)', () => {
  it.each([
    'ავთან დაკავშირებული ჩანაწერიდან „ელექტრიკოსი" მოვხსენი.',
    'ეს ინფორმაცია ამოვიღე.',
    'ჩანაწერი გავასუფთავე.',
    'That note has been removed.',
    'I cleared it.',
    'Я убрал эту заметку.',
  ])('„%s" claims a deletion', (reply) => {
    expect(claimsADeletion(reply)).toBe(true);
  });

  it('an ordinary reply does not', () => {
    expect(claimsADeletion('ელექტრიკოსად გყავს შენახული ავთო.')).toBe(false);
  });
});
