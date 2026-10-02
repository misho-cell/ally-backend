/**
 * The tester's 1012 (thread 30041): the question went out as a step and the
 * final was only „დაველოდები შენს პასუხს.". Such a final is no answer.
 */
import { isOnlyAWaitingLine } from '../chat.service';

describe('isOnlyAWaitingLine', () => {
  it('catches the filler in every language', () => {
    expect(isOnlyAWaitingLine('დაველოდები შენს პასუხს.')).toBe(true);
    expect(isOnlyAWaitingLine('*(ველოდები პასუხს)*')).toBe(true);
    expect(isOnlyAWaitingLine("I'll wait for your answer.")).toBe(true);
    expect(isOnlyAWaitingLine('Жду твоего ответа.')).toBe(true);
    expect(isOnlyAWaitingLine('Espero tu respuesta.')).toBe(true);
  });

  /** The tester's 1048 (thread 30889): waiting for a choice, second person too. */
  it('catches waiting for a choice or a yes, in either person', () => {
    expect(isOnlyAWaitingLine('ელოდები, რომ აირჩიო.')).toBe(true);
    expect(isOnlyAWaitingLine('ველოდები შენს არჩევანს.')).toBe(true);
    expect(isOnlyAWaitingLine('დაველოდები, რომ დამიდასტურო.')).toBe(true);
    expect(isOnlyAWaitingLine("I'm waiting for you to choose.")).toBe(true);
  });

  it('leaves a reply that says more alone', () => {
    expect(isOnlyAWaitingLine('ნანას გირჩევ — ასე გადავცე? დაველოდები შენს პასუხს.')).toBe(false);
    expect(isOnlyAWaitingLine('პასუხი გაიგზავნა.')).toBe(false);
    expect(isOnlyAWaitingLine('ნანას გირჩევ. ველოდები, რომ აირჩიო.')).toBe(false);
  });
});
