jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import {
  campaignsPerDay,
  campaignsThatSentToday,
  peoplePerCampaign,
  withinDailyCampaignCap,
} from '../chorusCap';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * Row 301 — Tornike, 1 October: „Yes, with the 5-a-day cap." The cap is in the
 * code before any restart: campaigns per day, people per campaign.
 */
describe('how many campaigns may send in a day', () => {
  const rows = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ campaign_id: id }));

  it('lets five new campaigns through, oldest first, and holds the rest', () => {
    expect(withinDailyCampaignCap(rows, new Set(), 5).map((r) => r.campaign_id)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it('counts campaigns that already sent today against the cap', () => {
    const kept = withinDailyCampaignCap(rows, new Set([10, 11, 12]), 5);
    expect(kept.map((r) => r.campaign_id)).toEqual([1, 2]);
  });

  it('always lets a campaign that is already sending today go on', () => {
    const kept = withinDailyCampaignCap([{ campaign_id: 3 }], new Set([1, 2, 3, 4, 5]), 5);
    expect(kept).toEqual([{ campaign_id: 3 }]);
  });

  it('counts two rows of one campaign once', () => {
    const kept = withinDailyCampaignCap(
      [{ campaign_id: 1 }, { campaign_id: 1 }, { campaign_id: 2 }],
      new Set(),
      1,
    );
    expect(kept).toEqual([{ campaign_id: 1 }, { campaign_id: 1 }]);
  });
});

describe('the numbers are config', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('defaults to five campaigns a day and eight people a campaign', () => {
    delete process.env.CHORUS_CAMPAIGNS_PER_DAY;
    delete process.env.CHORUS_MAX_PEOPLE_PER_CAMPAIGN;
    expect(campaignsPerDay()).toBe(5);
    expect(peoplePerCampaign()).toBe(8);
  });

  it('is raised by the env, and a nonsense value falls back to the default', () => {
    process.env.CHORUS_CAMPAIGNS_PER_DAY = '12';
    process.env.CHORUS_MAX_PEOPLE_PER_CAMPAIGN = '-3';
    expect(campaignsPerDay()).toBe(12);
    expect(peoplePerCampaign()).toBe(8);
  });
});

describe('the day is Tbilisi’s', () => {
  it('reads today’s sending campaigns from the start of the Tbilisi day, with a limit and timeout', async () => {
    mockQuery.mockResolvedValue({ rows: [{ campaign_id: '7' }], rowCount: 1 } as never);
    expect(await campaignsThatSentToday()).toEqual(new Set([7]));
    const [sql, , timeout] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain("AT TIME ZONE 'Asia/Tbilisi'");
    expect(String(sql)).toContain('LIMIT');
    expect(timeout).toBeGreaterThan(0);
  });
});

describe('where the cap is enforced', () => {
  const chorus = readFileSync(join(__dirname, '..', 'chorusCampaign.service.ts'), 'utf8');

  it('on every send — the backlog cannot leave all at once', () => {
    const send = chorus.slice(chorus.indexOf('export async function sendDueCampaignAsks'));
    expect(send).toContain('withinDailyCampaignCap(');
    expect(send).toContain('asked.asked_at IS NOT NULL) < $4');
    expect(send).toContain('for (const row of sendable)');
  });

  it('on scheduling and on opening', () => {
    expect(chorus).toContain('candidatesForTarget.slice(0, Math.min(dial, peoplePerCampaign()))');
    expect(chorus).toContain('if (openedToday >= campaignsPerDay()) break;');
  });
});
