import {
  INSTRUCTION_UNSENT_NUDGE,
  PROMISED_ACTION_NO_GOAL_NUDGE,
  PROMISED_ACTION_NUDGE,
} from '../replyGuards';

/**
 * 2905 (the tester's 45675, §99.1): after the promise note the answer written
 * again read „ეს ორი სანტექნიკოსი…" with no name, as if the owner had seen the
 * first draft. Each note that has the answer written again asks for names.
 */
describe('a note that has the answer written again', () => {
  it.each([
    ['promise, with a goal', PROMISED_ACTION_NUDGE],
    ['promise, without a goal', PROMISED_ACTION_NO_GOAL_NUDGE],
    ['instruction left unsent', INSTRUCTION_UNSENT_NUDGE],
  ])('%s asks for the people by name', (_name, note) => {
    expect(note).toContain('ვისზეც წერ, სახელით დაასახელე');
    expect(note).toContain('მფლობელს შენი წინა ტექსტი არ უნახავს');
    expect(note.endsWith(')')).toBe(true);
  });
});
