jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import {
  ANSWER_GIST_MAX_CHARS,
  answerGist,
  answerLine,
  LatestAnswer,
} from '../latestAnswers.service';

function answered(answer: string | null, declined = false): LatestAnswer {
  return {
    ask_id: 1,
    task_id: 2,
    thread_id: 3,
    case_title: 'ბუღალტერი',
    to_name: 'ლიკა',
    declined,
    answer,
    answered_at: new Date('2026-10-20T12:00:00Z'),
  };
}

/** #6768 (Giorgi, 20 Oct): „ბოლო სიახლეები" said only that someone replied, not what. */
describe('the home card says what the person answered', () => {
  it('puts the stored answer after the name', () => {
    expect(answerLine(answered('იცნობს თემურს და დაგვეხმარება.'), 'ka')).toBe(
      'ლიკა: იცნობს თემურს და დაგვეხმარება.',
    );
  });

  it('says a refusal with its own words too', () => {
    expect(answerLine(answered('ამ ეტაპზე ვერ დაგაკავშირებს.', true), 'ka')).toBe(
      'ლიკა: ამ ეტაპზე ვერ დაგაკავშირებს.',
    );
  });

  it('keeps the goal’s line when nothing was stored', () => {
    expect(answerLine(answered(null), 'ka')).toBe('ლიკა: უპასუხა');
    expect(answerLine(answered('   '), 'ka')).toBe('ლიკა: უპასუხა');
  });

  it('drops the number markers, folds the lines, and cuts a long answer on a word', () => {
    expect(answerGist('ნომერი:\n⟦own⟧+995000⟦/own⟧')).toBe('ნომერი: +995000');
    const long = `${'სიტყვა '.repeat(60)}ბოლო`;
    const gist = answerGist(long);
    expect(gist.length).toBeLessThanOrEqual(ANSWER_GIST_MAX_CHARS + 1);
    expect(gist.endsWith('სიტყვა…')).toBe(true);
  });
});
