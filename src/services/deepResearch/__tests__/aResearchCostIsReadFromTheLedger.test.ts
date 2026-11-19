const mockQuery = jest.fn();
const mockRecordFixedUsage = jest.fn();
jest.mock('../../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));
jest.mock('../../costLedger.service', () => ({
  getPrice: async (key: string) => (key === 'linkup.deep' ? 0.006 : 0.005),
  recordFixedUsage: (...a: unknown[]) => mockRecordFixedUsage(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { ProviderName } from '../deepResearch.types';
import { cachedPage, keepPage } from '../pageCache';
import { chargeCall, dailyLimitUsd, priceOf, spentOnRun, spentToday } from '../researchSpend';

const ENV = { ...process.env };

beforeEach(() => {
  mockQuery.mockReset();
  mockRecordFixedUsage.mockReset();
  process.env = { ...ENV };
});

afterAll(() => {
  process.env = ENV;
});

/** Misho, 19 Nov: what the research spends is counted, and the admin sets the limit. */
describe('a research cost is read from the ledger', () => {
  it('sums the run’s own booked calls, and the day’s across all research', async () => {
    mockQuery.mockResolvedValue({ rows: [{ usd: '0.123' }] });
    await expect(spentOnRun('dr-1')).resolves.toBe(0.123);
    expect(mockQuery.mock.calls[0][1]).toEqual(['dr-1', expect.any(Array)]);
    mockQuery.mockResolvedValue({ rows: [{ usd: null }] });
    await expect(spentToday()).resolves.toBe(0);
    expect(String(mockQuery.mock.calls[1][0])).toContain("date_trunc('day', NOW())");
  });

  it('prices a step from the price table', async () => {
    await expect(priceOf(['exa.search', 'linkup.deep'])).resolves.toBeCloseTo(0.011);
  });

  it('books a call on the run, attributed to nobody', async () => {
    await chargeCall('dr-1', ProviderName.Exa, 'exa.search');
    expect(mockRecordFixedUsage).toHaveBeenCalledWith({
      userId: null,
      kind: 'deep_research_search',
      provider: ProviderName.Exa,
      priceKey: 'exa.search',
      runId: 'dr-1',
    });
  });

  it('takes the daily limit from the environment, with a default', () => {
    process.env.DEEP_RESEARCH_DAILY_USD = '5';
    expect(dailyLimitUsd()).toBe(5);
    process.env.DEEP_RESEARCH_DAILY_USD = 'lots';
    expect(dailyLimitUsd()).toBe(25);
  });

  it('keeps a read page for a month and serves it back', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ title: 'Team', text: 'Nino' }] });
    await expect(cachedPage('https://a.ge')).resolves.toEqual({
      url: 'https://a.ge',
      title: 'Team',
      text: 'Nino',
      provider: ProviderName.Firecrawl,
    });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(cachedPage('https://b.ge')).resolves.toBeNull();
    await keepPage({
      url: 'https://a.ge',
      title: 'T',
      text: 'x',
      provider: ProviderName.Firecrawl,
    });
    expect(String(mockQuery.mock.calls[2][0])).toContain('ON CONFLICT (url) DO UPDATE');
  });
});

/** The admin route: one person at a time, every refusal its own status. */
describe('the deep-research route', () => {
  const admin = readFileSync(join(__dirname, '../../../api/routes/admin.routes.ts'), 'utf8');
  const route = admin.slice(admin.indexOf("'/deep-research/people'"));
  const body = route.slice(0, route.indexOf('\n);\n'));

  it('is rate limited and checks the body, the keys and the subject before anything runs', () => {
    expect(body).toContain('rateLimit(');
    expect(body.indexOf('res.status(400)')).toBeLessThan(body.indexOf('researchByNumber('));
    expect(body.indexOf('res.status(503)')).toBeLessThan(body.indexOf('researchByNumber('));
    expect(body).toContain('res.status(403)');
    expect(body).toContain(
      "res.status(500).json({ success: false, error: 'The research did not run' })",
    );
  });
});
