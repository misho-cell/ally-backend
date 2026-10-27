jest.mock('../../db/postgres/client', () => ({
  query: jest.fn(),
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  __esModule: true,
  default: { end: jest.fn() },
}));
jest.mock('../tools/nameMatch', () => ({
  __esModule: true,
  ...jest.requireActual('../tools/nameMatch'),
  messageNamesOwnContact: jest.fn(),
}));

import { approvesAnInstruction } from '../chat.service';
import { messageNamesOwnContact } from '../tools/nameMatch';

/**
 * #8054 (1) (founder 27 Oct): after an explicit „ჰკითხე X-ს" the owner was
 * asked to approve, on a plan card, what they had just ordered. The
 * instruction naming their own contact is the approval itself (D316).
 */
const mockNames = messageNamesOwnContact as jest.MockedFunction<typeof messageNamesOwnContact>;
const ORDER = 'ჰკითხე ნინოს, იცნობს თუ არა კარგ ნოტარიუსს';
const APPROVE = ['ვადასტურებ', 'შეცვლა'];

beforeEach(() => jest.clearAllMocks());

describe('approve buttons after an explicit instruction (#8054)', () => {
  it('are not shown when the owner just ordered it about their own contact', async () => {
    mockNames.mockResolvedValue(true);
    await expect(approvesAnInstruction('7', ORDER, APPROVE, false)).resolves.toBe(true);
  });

  it('are shown when the named person is not the owner’s contact', async () => {
    mockNames.mockResolvedValue(false);
    await expect(approvesAnInstruction('7', ORDER, APPROVE, false)).resolves.toBe(false);
  });

  it('are shown when the owner’s line is not an instruction', async () => {
    mockNames.mockResolvedValue(true);
    await expect(
      approvesAnInstruction('7', 'ვეძებ კარგ ნოტარიუსს თბილისში', APPROVE, false),
    ).resolves.toBe(false);
    expect(mockNames).not.toHaveBeenCalled();
  });

  it('never matter for buttons that approve nothing, nor on a wake', async () => {
    mockNames.mockResolvedValue(true);
    await expect(approvesAnInstruction('7', ORDER, ['კი', 'არა'], false)).resolves.toBe(false);
    await expect(approvesAnInstruction('7', ORDER, APPROVE, true)).resolves.toBe(false);
  });
});
