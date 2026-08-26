jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../referralLink.service', () => ({ __esModule: true, getReferralFunnel: jest.fn() }));

import { query } from '../../db/postgres/client';
import { getReferralFunnel } from '../referralLink.service';
import {
  buildLabReport,
  generateAndStoreWeeklyReport,
  getStoredLabReports,
  currentWeekStartISO,
} from '../labReport.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockGetReferralFunnel = getReferralFunnel as jest.MockedFunction<typeof getReferralFunnel>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

const FUNNEL = { sent: 5, opened: 3, registered: 2, note: 'x' };

function routeReportQueries(opts: {
  askDial?: { ask_count_dial: number; city: string | null; campaigns: string; joins: string }[];
  spacing?: { day_offset: string; asked: string; joined: string }[];
  fatigue?: { fatigue_signals: string; users: string }[];
  factsPerWeek?: { week: string; source: string | null; facts: string; users: string }[];
}): void {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('GROUP BY ask_count_dial, city'))
      return Promise.resolve(rows(opts.askDial ?? []) as never);
    if (sql.includes('FROM invite_campaign_participants p'))
      return Promise.resolve(rows(opts.spacing ?? []) as never);
    if (sql.includes('fatigue_signals, COUNT(*) AS users'))
      return Promise.resolve(rows(opts.fatigue ?? []) as never);
    if (sql.includes('FROM contact_facts'))
      return Promise.resolve(rows(opts.factsPerWeek ?? []) as never);
    return Promise.resolve(rows([]) as never);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetReferralFunnel.mockResolvedValue(FUNNEL);
});

describe('currentWeekStartISO', () => {
  it('always returns a Monday', () => {
    const result = currentWeekStartISO();
    const day = new Date(`${result}T00:00:00Z`).getUTCDay();
    expect(day).toBe(1);
  });
});

describe('buildLabReport', () => {
  it('computes join_rate correctly per dial setting', async () => {
    routeReportQueries({
      askDial: [{ ask_count_dial: 8, city: 'თბილისი', campaigns: '4', joins: '1' }],
    });

    const report = await buildLabReport('2026-08-24');

    expect(report.ask_dial_table).toEqual([
      { ask_count_dial: 8, city: 'თბილისი', campaigns: 4, joins: 1, join_rate: 0.25 },
    ]);
  });

  it('computes spacing join_rate per day-offset position', async () => {
    routeReportQueries({
      spacing: [{ day_offset: '1', asked: '10', joined: '3' }],
    });

    const report = await buildLabReport('2026-08-24');

    expect(report.spacing_results).toEqual([
      { day_offset: 1, asked: 10, joined: 3, join_rate: 0.3 },
    ]);
  });

  it('reuses the existing referral funnel for the links component', async () => {
    routeReportQueries({});

    const report = await buildLabReport('2026-08-24');

    expect(report.links_funnel).toEqual(FUNNEL);
    expect(mockGetReferralFunnel).toHaveBeenCalledWith();
  });

  it('carries the live budget config and the fatigue distribution', async () => {
    routeReportQueries({
      fatigue: [
        { fatigue_signals: '0', users: '18' },
        { fatigue_signals: '1', users: '2' },
      ],
    });

    const report = await buildLabReport('2026-08-24');

    expect(report.budgets_ladder_state.fatigue_distribution).toEqual([
      { fatigue_signals: 0, users: 18 },
      { fatigue_signals: 1, users: 2 },
    ]);
    expect(report.budgets_ladder_state.effective_monthly_budget).toBeGreaterThan(0);
  });

  it('groups facts per week by the source that actually exists (no "asked" bucket)', async () => {
    routeReportQueries({
      factsPerWeek: [{ week: '2026-08-24T00:00:00.000Z', source: 'chat', facts: '5', users: '3' }],
    });

    const report = await buildLabReport('2026-08-24');

    expect(report.facts_per_week).toEqual([
      { week: '2026-08-24T00:00:00.000Z', source: 'chat', facts: 5, users: 3 },
    ]);
  });

  it('documents the three components that could not be built, honestly', async () => {
    routeReportQueries({});

    const report = await buildLabReport('2026-08-24');

    expect(report.not_built).toEqual(
      expect.arrayContaining([
        expect.stringContaining('technique_conversion'),
        expect.stringContaining('curiosity_answer_rate'),
        expect.stringContaining('facts_used_rate'),
      ]),
    );
  });
});

describe('generateAndStoreWeeklyReport', () => {
  it('upserts the snapshot keyed by week_start', async () => {
    routeReportQueries({});

    await generateAndStoreWeeklyReport('2026-08-24');

    const insertCall = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('INSERT INTO lab_reports'),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall?.[0]).toContain('ON CONFLICT (week_start) DO UPDATE');
    expect(insertCall?.[1]?.[0]).toBe('2026-08-24');
  });
});

describe('getStoredLabReports', () => {
  it('reads snapshots newest first, respecting the limit', async () => {
    mockQuery.mockResolvedValue(
      rows([{ week_start: '2026-08-24', report_json: {}, generated_at: 'x' }]) as never,
    );

    const out = await getStoredLabReports(5);

    expect(out).toHaveLength(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql as string).toContain('ORDER BY week_start DESC');
    expect(params).toEqual([5]);
  });
});
