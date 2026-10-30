jest.mock('../roster.service', () => ({
  __esModule: true,
  addRosterMember: jest.fn().mockResolvedValue({ changed: true }),
  removeRosterMember: jest.fn().mockResolvedValue({ changed: true }),
}));
jest.mock('../testSeatCreate.service', () => {
  class SeatCreationRefused extends Error {}
  return {
    __esModule: true,
    SeatCreationRefused,
    inviterSeatPhone: jest.fn(),
  };
});

import { readFileSync } from 'fs';
import { join } from 'path';
import { addRosterMember, removeRosterMember } from '../roster.service';
import { inviterSeatPhone, SeatCreationRefused } from '../testSeatCreate.service';
import {
  isSeatMembershipStatus,
  SeatMembershipStatus,
  setSeatMembership,
} from '../seatMembership.service';

/**
 * #7758 (tester 79008): a community on a fictional seat, current or former, so
 * „a former member is never called current" can be run on fictions.
 */
const mockPhone = inviterSeatPhone as jest.MockedFunction<typeof inviterSeatPhone>;

beforeEach(() => jest.clearAllMocks());

describe('a seat’s community', () => {
  it('is a live membership when current', async () => {
    mockPhone.mockResolvedValueOnce('+995500000001');
    expect(await setSeatMembership(7, 'Axel', SeatMembershipStatus.Current, '1')).toBe(true);
    expect(addRosterMember).toHaveBeenCalledWith('Axel', '+995500000001', '1');
    expect(removeRosterMember).not.toHaveBeenCalled();
  });

  it('is retracted and marked former when former', async () => {
    mockPhone.mockResolvedValueOnce('+995500000001');
    await setSeatMembership(7, 'Axel', SeatMembershipStatus.Former, '1');
    expect(removeRosterMember).toHaveBeenCalledWith('Axel', '+995500000001');
    expect(addRosterMember).toHaveBeenCalledWith('Axel', '+995500000001', '1', { former: true });
  });

  it('is refused for a real account before anything is written', async () => {
    mockPhone.mockRejectedValueOnce(new SeatCreationRefused('not a seat'));
    await expect(
      setSeatMembership(7, 'Axel', SeatMembershipStatus.Current, '1'),
    ).rejects.toBeInstanceOf(SeatCreationRefused);
    expect(addRosterMember).not.toHaveBeenCalled();
  });

  it('takes only current or former, at POST /admin/test-accounts/:id/memberships', () => {
    expect(isSeatMembershipStatus('former')).toBe(true);
    expect(isSeatMembershipStatus('past')).toBe(false);
    const admin = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    expect(admin).toContain("'/test-accounts/:id/memberships'");
  });
});
