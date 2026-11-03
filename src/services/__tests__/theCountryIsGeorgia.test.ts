jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { worldQuestionPrompt } from '../worldAnswer';

/** #8682: „who heads the Ministry of Health" was answered „which country?". */
describe('a question that needs a country (#8682)', () => {
  const prompt = worldQuestionPrompt('ვინ ხელმძღვანელობს ჯანდაცვის სამინისტროს?', 'ka');

  it('is answered for Georgia when it names none', () => {
    expect(prompt).toContain('answer for Georgia');
  });

  it('still never assumes a city (#8520)', () => {
    expect(prompt).toContain('do not assume one');
    expect(prompt).toContain('the city is needed');
  });
});
