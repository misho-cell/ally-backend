import { readFileSync } from 'fs';
import { join } from 'path';
import { lastQuestionIn, questionForButtons } from '../buttonsCarryTheQuestion';

/**
 * 2971 (conv 44420): the profile question went out only as a step bubble; the
 * kept message said „ვუცდი შენს პასუხს." over five buttons.
 */
const STEP = { id: 7, text: 'რომელი ტიპის გაცნობა არ გავაკეთო შენთვის?' };

describe('the question the buttons answer', () => {
  it('is taken from the last step that asked one, when the reply asks nothing', () => {
    expect(questionForButtons('ვუცდი შენს პასუხს.', [{ id: 6, text: 'ვეძებ…' }, STEP])).toEqual({
      question: 'რომელი ტიპის გაცნობა არ გავაკეთო შენთვის?',
      step: STEP,
    });
  });

  it('is none when the reply asks its own question, or no step asked one', () => {
    expect(questionForButtons('გინდა, ვკითხო?', [STEP])).toBeNull();
    expect(
      questionForButtons('ვუცდი შენს პასუხს.', [{ id: 6, text: 'ვეძებ კონტაქტებში.' }]),
    ).toBeNull();
  });

  it('reads the last question sentence of a longer step', () => {
    expect(lastQuestionIn('ორი რამ ვნახე. რომელი გირჩევნია? მეორე უფრო ახლოსაა.')).toBe(
      'რომელი გირჩევნია?',
    );
  });
});

describe('where it runs', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('only under a reply that has buttons, and drops a step that said nothing else', () => {
    expect(chat).toContain('!buriedAnswer && choices !== undefined && choices.length > 0');
    expect(chat).toContain('if (askedInAStep.step.text.trim() === askedInAStep.question) {');
  });
});
