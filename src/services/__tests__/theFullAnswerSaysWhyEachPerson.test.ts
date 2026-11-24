/**
 * Misho, 24 Nov: „the answer is very good; the one thing missing is why these
 * people were sent" — in the full answer only. Its instruction asks for the
 * real tie behind every person it names, never a bare „they fit".
 */
jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { FULL_RESEARCH_HEADER } from '../fullResearch.service';

describe('the full answer explains each person', () => {
  it('asks for why each named person was chosen, always', () => {
    expect(FULL_RESEARCH_HEADER).toContain(
      'why you chose them — ALWAYS, for every person you name',
    );
  });

  it('asks for the tie itself: the company, a saved label, a note or a page', () => {
    expect(FULL_RESEARCH_HEADER).toContain('works at X');
    expect(FULL_RESEARCH_HEADER).toContain('the label someone saved them under');
    expect(FULL_RESEARCH_HEADER).toContain('never only „they fit"');
  });
});
