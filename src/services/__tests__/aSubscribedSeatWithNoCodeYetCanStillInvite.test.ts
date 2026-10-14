import { query } from '../../db/postgres/client';
import { getOrCreateReferralCode } from '../referralCode.service';
import { inviterSeatReferralCode, SeatCreationRefused } from '../testSeatCreate.service';

jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  withTransaction: jest.fn(),
}));
jest.mock('../referralCode.service', () => ({
  __esModule: true,
  getOrCreateReferralCode: jest.fn(),
}));

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockMint = getOrCreateReferralCode as jest.MockedFunction<typeof getOrCreateReferralCode>;
const SEAT = '184575';

/**
 * The tester's 58157: the newest seats were subscribed but had never had their
 * code read, so the gate's code branch could not be asked with them.
 */
describe('a seat with no referral code yet can still stand in for an inviter', () => {
  beforeEach(() => jest.clearAllMocks());

  it('mints the seat its code, the way a member gets one on first read', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ referral_code: null }] } as never);
    mockMint.mockResolvedValueOnce('MINTED23');

    await expect(inviterSeatReferralCode(SEAT)).resolves.toBe('MINTED23');
    expect(mockMint).toHaveBeenCalledWith(SEAT);
  });

  it('keeps a code the seat already has', async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ referral_code: 'KEPT2345' }],
    } as never);

    await expect(inviterSeatReferralCode(SEAT)).resolves.toBe('KEPT2345');
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('still refuses anybody who is not a seat, and mints nothing for them', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] } as never);

    await expect(inviterSeatReferralCode('171873')).rejects.toBeInstanceOf(SeatCreationRefused);
    expect(mockMint).not.toHaveBeenCalled();
  });
});
