jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { ownerSaysSolved } from '../chat.service';

/** The tester's 64517 (56218): „No need, it is solved." kept the goal open. */
describe('the owner saying it is solved', () => {
  it('counts when a polite „no need" comes first', () => {
    expect(
      ownerSaysSolved('No need, it is solved. Levan Abashidze helped me find him.', null),
    ).toBe(true);
    expect(ownerSaysSolved('Not needed anymore, solved.', null)).toBe(true);
  });

  it('still does not count a real no', () => {
    expect(ownerSaysSolved('No, it is not solved yet.', null)).toBe(false);
    expect(ownerSaysSolved('Not solved.', null)).toBe(false);
  });
});
