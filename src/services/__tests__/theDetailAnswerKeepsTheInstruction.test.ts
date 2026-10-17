jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import {
  grantPermissionRefusal,
  instructionAwaitingItsDetail,
  PlanConsentScreen,
  readPlanConsentScreen,
} from '../chat.service';

/** D795 (prompt chat 65225, item 6): the detail answer must not lose the instruction's yes. */
describe('an instruction that waited for its day', () => {
  const lines = (...said: string[]) =>
    said.map((content, i) => ({ at: `2026-10-17T17:0${i}:00Z`, content }));

  it('is the yes once the owner gives the day', () => {
    const screen = readPlanConsentScreen(
      [],
      lines('სთხოვე ლევანს, მაგიდა დაგვიჯავშნოს', 'ხვალ 8 საათზე, 4 კაცი'),
    );
    expect(instructionAwaitingItsDetail(screen)).toEqual(['სთხოვე ლევანს, მაგიდა დაგვიჯავშნოს']);
    expect(grantPermissionRefusal(true, screen)).toBeNull();
  });

  it('is not borrowed from a line that was not such an instruction', () => {
    const screen = readPlanConsentScreen([], lines('ბუღალტერი მჭირდება', 'ხვალ 8 საათზე'));
    expect(instructionAwaitingItsDetail(screen)).toEqual([]);
    expect(grantPermissionRefusal(true, screen)?.reason).toBe('owner_did_not_say_so');
  });

  it('is not needed when the instruction already had its day', () => {
    const screen: PlanConsentScreen = {
      lastOwnerMessage: 'კარგი',
      newestOfferedChoices: null,
      ownerSaidSinceCard: [],
      labelsDealtAfterTheCard: [],
      previousOwnerMessage: 'სთხოვე ლევანს, ხვალ 8-ზე მაგიდა დაგვიჯავშნოს',
    };
    expect(instructionAwaitingItsDetail(screen)).toEqual([]);
  });
});
