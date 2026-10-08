import { readFileSync } from 'fs';
import { join } from 'path';
import {
  asksToDelete,
  claimsADeletion,
  deletionClaimWithoutTool,
  notDeletedLine,
} from '../deletionClaim';

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
    expect(
      deletionClaimWithoutTool(
        reply,
        ['search_contact_by_name'],
        'დაივიწყე, რომ ავთო ელექტრიკოსია.',
      ),
    ).toBe(true);
  });

  it('a deleting tool in the run makes the claim true', () => {
    expect(
      deletionClaimWithoutTool(
        'ჩანაწერი წავშალე.',
        ['forget_contact_fact'],
        'დაივიწყე, რომ ავთო ელექტრიკოსია.',
      ),
    ).toBe(false);
  });

  it('a reply that deletes nothing and says nothing of it is left alone', () => {
    expect(
      deletionClaimWithoutTool('ავთო ელექტრიკოსია.', [], 'დაივიწყე, რომ ავთო ელექტრიკოსია.'),
    ).toBe(false);
  });

  it('the owner reads the truth and a confirm button', () => {
    expect(notDeletedLine('ka')).toEqual({
      text: 'ეს ჯერ არ წამიშლია. დამიდასტურე და ახლავე წავშლი.',
      confirm: 'კი, წაშალე',
    });
    expect(chat).toContain(
      "deletionClaimWithoutTool(finalText, toolNamesUsed, runOwnerLine.get(runId) ?? '')",
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

describe('a plain question never gets the delete card (3565)', () => {
  it.each(['Who do I have as a lawyer?', 'ვინ შემინახა და როგორ?'])('„%s"', (line) => {
    expect(asksToDelete(line)).toBe(false);
    expect(deletionClaimWithoutTool('That old note was removed.', [], line)).toBe(false);
  });

  it.each(['დაივიწყე, რომ ავთო ელექტრიკოსია.', 'წაშალე ეს ჩანაწერი', 'Please forget that.'])(
    'a delete request „%s" still does',
    (line) => {
      expect(asksToDelete(line)).toBe(true);
    },
  );
});

describe('every claim word is matched whole (3565, ops 20:40Z)', () => {
  it.each([
    'That is quite a list of lawyers.',
    'We can eliminate the ones who moved away.',
    '¿Quieres quitar a alguien de la lista?',
    '¿Quieres que lo borre?',
    'სიიდან სამი კონტაქტი ამოვიღეთ და გადავამოწმეთ.',
    'Он удалился от дел в прошлом году.',
  ])('an ordinary reply „%s" claims nothing', (reply) => {
    expect(claimsADeletion(reply)).toBe(false);
  });

  it.each([
    'Listo, lo borré.',
    'Lo quité de tus notas.',
    'He eliminado esa nota.',
    'Я удалила эту заметку.',
    'ჩანაწერი წავშალეთ.',
  ])('a real claim „%s" still is one', (reply) => {
    expect(claimsADeletion(reply)).toBe(true);
  });
});
