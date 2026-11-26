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

describe('the full answer is short and ends on the next step (Misho, 26 Nov)', () => {
  it('asks for a short answer with no account of the search', () => {
    expect(FULL_RESEARCH_HEADER).toContain('at most two sentences for an option');
    expect(FULL_RESEARCH_HEADER).toContain('no explanation of how you searched');
  });

  it('gives no public link, number or email, and never „contact them yourself"', () => {
    expect(FULL_RESEARCH_HEADER).not.toContain('with its link');
    expect(FULL_RESEARCH_HEADER).not.toContain('public contact.');
    expect(FULL_RESEARCH_HEADER).toContain('never a public number, email or link');
  });

  it('ends with the next step as its own last paragraph: what Netai does, what the owner does', () => {
    expect(FULL_RESEARCH_HEADER).toContain('End with THE NEXT STEP as its own last paragraph');
    expect(FULL_RESEARCH_HEADER).toContain('what you will do yourself and what the');
  });
});
