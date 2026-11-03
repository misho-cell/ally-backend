import { readFileSync } from 'fs';
import { join } from 'path';
import { distinctNames } from '../bridgePicker';

/** #8649 (Lika's test, 3 Nov; the tester's 81446), the push and the picker. */
describe('the push and the picker show the reader one clean question', () => {
  it('lists a person saved twice once', () => {
    expect(distinctNames(['tornike abuladze Whatsapp', 'tornike abuladze', 'ნიკა'])).toEqual([
      'tornike abuladze',
      'ნიკა',
    ]);
  });

  it('keeps two different people who share a first name', () => {
    expect(distinctNames(['ნიკა ბერიძე', 'ნიკა კაპანაძე'])).toEqual([
      'ნიკა ბერიძე',
      'ნიკა კაპანაძე',
    ]);
  });

  it('pushes the question the reader is shown, not the owner’s raw words', () => {
    const code = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(code).toContain('body: edited.question.slice(0, MAX_ASK_PUSH_CHARS),');
    expect(code).not.toContain(': safeQuestion\n        ).slice(0, 120)');
  });
});
