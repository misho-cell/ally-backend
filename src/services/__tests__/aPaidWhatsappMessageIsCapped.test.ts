jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../costLedger.service', () => ({ __esModule: true, getPrice: jest.fn() }));

import { query } from '../../db/postgres/client';
import { getPrice } from '../costLedger.service';
import { paidTemplateAllowed, paidTemplateMayGo } from '../whatsappChannel.service';

/**
 * Misho, 27 Oct (yes to $50): before the channel is switched on, a paid
 * template goes at most once per person per day, and never past the month's
 * budget.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockPrice = getPrice as jest.MockedFunction<typeof getPrice>;

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.WHATSAPP_MONTHLY_BUDGET_USD;
});

describe('a paid WhatsApp template', () => {
  it('goes once per person per day', () => {
    expect(paidTemplateAllowed(0, 10, 0.05, 50)).toBe(true);
    expect(paidTemplateAllowed(1, 10, 0.05, 50)).toBe(false);
  });

  it('stops when one more would pass the month’s budget', () => {
    expect(paidTemplateAllowed(0, 999, 0.05, 50)).toBe(true);
    expect(paidTemplateAllowed(0, 1000, 0.05, 50)).toBe(false);
  });

  it('reads today’s and the month’s, and takes the stored price', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ today: 0, month: 3 }], rowCount: 1 } as never);
    mockPrice.mockResolvedValueOnce(0.04);
    await expect(paidTemplateMayGo(7)).resolves.toBe(true);
    expect(String(mockQuery.mock.calls[0][0])).toContain("date_trunc('month'");
    expect(mockQuery.mock.calls[0][1]).toEqual([7, 'out', 'template']);
  });

  it('keeps to a smaller budget set in Railway', async () => {
    process.env.WHATSAPP_MONTHLY_BUDGET_USD = '0.1';
    mockQuery.mockResolvedValueOnce({ rows: [{ today: 0, month: 2 }], rowCount: 1 } as never);
    mockPrice.mockResolvedValueOnce(0.05);
    await expect(paidTemplateMayGo(7)).resolves.toBe(false);
  });

  it('sends nothing paid when the count cannot be read', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    await expect(paidTemplateMayGo(7)).resolves.toBe(false);
  });
});
