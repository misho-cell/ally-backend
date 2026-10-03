import { readFileSync } from 'fs';
import { join } from 'path';
import { isQuestionNotGoal, looksLikeGoalRequest } from '../goalIntent';

/**
 * Board #501 (Ninia, 2 Oct): „ვის შევთავაზო Netai?" from the goal box opened a
 * goal, ran the opening searches and wrote invite text nobody had asked for.
 */
describe('whom to offer Netai to', () => {
  it.each([
    'ვის შევთავაზო Netai?',
    'ჩემი კონტაქტებიდან ვის შევთავაზო Netai პირველ რიგში?',
    'ვის მოვიწვიო ნეტაიში?',
    'Who should I invite to Netai?',
    'Whom should I offer Netai to first?',
  ])('„%s" is a question, so the goal box does not open a goal', (message) => {
    expect(isQuestionNotGoal(message)).toBe(true);
  });

  it.each([
    'Find me someone who can sell Netai in Batumi',
    'მჭირდება მარკეტოლოგი, ვინც Netai-ს შესთავაზებს კომპანიებს',
  ])('„%s" states a need and stays a goal', (message) => {
    expect(isQuestionNotGoal(message)).toBe(false);
    expect(looksLikeGoalRequest(message)).toBe(true);
  });

  it('does not touch an offer question about something else', () => {
    expect(isQuestionNotGoal('ვის შევთავაზო ჩემი ბინა?')).toBe(false);
  });

  it('tells invite_contact to give names first and text only when asked', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const tool = chat.slice(chat.indexOf("name: 'invite_contact'")).slice(0, 2000);
    expect(tool).toContain('asks for NAMES, not texts');
    expect(tool).toContain('call this only once the user picks one or asks for the text');
  });
});
