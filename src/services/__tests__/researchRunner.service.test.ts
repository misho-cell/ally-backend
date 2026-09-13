/**
 * Ticket 19 [20]: the research runs itself.
 *
 * Three things are worth a test here and the rest is plumbing.
 *
 * 1. It spends nothing until somebody turns it on, and stops when the day's
 *    budget is gone. A background job that quietly spends money is a job
 *    nobody agreed to.
 * 2. A step it cannot run is written down as NOT ATTEMPTED. If „we never
 *    looked" and „we looked and found nothing" are stored the same way, the
 *    table teaches us a false lesson about a real person — the same false
 *    „done" that told somebody their note was deleted when it was not.
 * 3. It writes evidence and NOTHING about a person. The last test reads every
 *    table the runner touches and fails if a contact table is among them.
 */
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  backgroundQuery: jest.fn(),
  query: jest.fn(),
}));

const webSearch = jest.fn();
const webSearchConfigured = jest.fn(() => true);
jest.mock('../tools/webSearch', () => ({
  __esModule: true,
  webSearch: (...args: unknown[]): unknown => webSearch(...args),
  webSearchConfigured: (): boolean => webSearchConfigured(),
}));

const readLabels = jest.fn();
jest.mock('../labelReader.service', () => ({
  __esModule: true,
  readLabels: (...args: unknown[]): unknown => readLabels(...args),
}));

import { backgroundQuery } from '../../db/postgres/client';
import { runResearchOnce } from '../researchRunner.service';
import type { LabelSignals } from '../labelReader.service';

const mockQuery = backgroundQuery as jest.MockedFunction<typeof backgroundQuery>;

const PHONE = '+995500000001';

/** Somebody whose savers wrote one company word — the commonest shape. */
function oneCompanyWord(): LabelSignals {
  return {
    org_set: ['axel'],
    org_count: 1,
    org_detail: [{ word: 'axel', savers: 3, org_size: 40, org_rank: 5 }],
    name_tokens: ['levan', 'shalamberidze'],
    savers: 12,
    distinct_labels: 4,
    runs_it: false,
    in_big_organisation: false,
    several_directions: false,
    profession_with_clients: false,
    startup_hint: false,
    axel_hint: false,
    trade_only: false,
    name_only: false,
  };
}

/** Every SQL statement the runner sent, in order. */
let statements: string[] = [];

interface Rows {
  searchesToday?: number;
  due?: string[];
}

function withDatabase({ searchesToday = 0, due = [PHONE] }: Rows = {}): void {
  mockQuery.mockImplementation((sql: string) => {
    statements.push(sql);
    if (sql.includes("status <> 'not_attempted'") && sql.includes('COUNT(*)')) {
      return Promise.resolve({ rows: [{ n: String(searchesToday) }] }) as never;
    }
    if (sql.includes('FROM target_score_history')) {
      return Promise.resolve({ rows: due.map((phone) => ({ phone })) }) as never;
    }
    if (sql.includes('INSERT INTO research_steps')) {
      return Promise.resolve({ rows: [{ id: 1 }] }) as never;
    }
    if (sql.includes('INSERT INTO research_findings')) {
      return Promise.resolve({ rows: [{ id: 1 }] }) as never;
    }
    return Promise.resolve({ rows: [] }) as never;
  });
}

/** What was written to research_steps, as (source, status) pairs. */
function stepsWritten(): { source: string; status: string; note: string | null }[] {
  return mockQuery.mock.calls
    .filter(([sql]) => String(sql).includes('INSERT INTO research_steps'))
    .map(([, params]) => {
      const p = params as unknown[];
      return { source: String(p[2]), status: String(p[4]), note: (p[5] as string) ?? null };
    });
}

beforeEach(() => {
  statements = [];
  mockQuery.mockReset();
  webSearch.mockReset();
  readLabels.mockReset();
  readLabels.mockResolvedValue(new Map([[PHONE, oneCompanyWord()]]));
  webSearch.mockResolvedValue({
    results: [{ url: 'https://example.ge/levan', title: 'Levan', snippet: 'a page said this' }],
  });
  process.env.RESEARCH_RUNNER = 'on';
  delete process.env.RESEARCH_DAILY_SEARCHES;
});

afterEach(() => {
  delete process.env.RESEARCH_RUNNER;
  delete process.env.RESEARCH_DAILY_SEARCHES;
});

describe('the research runner spends nothing it was not told to spend', () => {
  it('does nothing at all until it is switched on', async () => {
    delete process.env.RESEARCH_RUNNER;
    withDatabase();

    const result = await runResearchOnce();

    expect(result.ran).toBe(false);
    expect(webSearch).not.toHaveBeenCalled();
    // Not one query either: an off job costs nothing, including a database round trip.
    expect(mockQuery).not.toHaveBeenCalled();
    expect(result.verdict).toContain('RESEARCH_RUNNER=on');
  });

  it('asks once whether search works at all, instead of finding out 200 times', async () => {
    // Left to discover it call by call, the runner would spend a whole day's
    // allowance writing the same error row over and over and then report a
    // day's work done.
    webSearchConfigured.mockReturnValueOnce(false);
    withDatabase();

    const result = await runResearchOnce();

    expect(result.ran).toBe(false);
    expect(webSearch).not.toHaveBeenCalled();
    expect(result.verdict).toContain('TAVILY_API_KEY');
  });

  it('stops for the day once the budget is spent, and says so', async () => {
    process.env.RESEARCH_DAILY_SEARCHES = '5';
    withDatabase({ searchesToday: 5 });

    const result = await runResearchOnce();

    expect(result.ran).toBe(false);
    expect(webSearch).not.toHaveBeenCalled();
    expect(result.verdict).toContain('5/5');
  });

  it('spends only what is left of the budget, not a whole tick', async () => {
    // One search left and a plan that asks for two.
    process.env.RESEARCH_DAILY_SEARCHES = '5';
    withDatabase({ searchesToday: 4 });

    const result = await runResearchOnce();

    expect(webSearch).toHaveBeenCalledTimes(1);
    expect(result.searches).toBe(1);
  });

  it('counts the budget from the record, so a restart cannot reset it', async () => {
    withDatabase({ searchesToday: 3 });
    await runResearchOnce();

    const budgetRead = statements.find(
      (s) => s.includes('COUNT(*)') && s.includes('research_steps'),
    );
    expect(budgetRead).toContain("date_trunc('day', NOW())");
  });
});

describe('a step that was never run never looks like a step that found nothing', () => {
  it('writes register and roster steps down as not attempted, with the reason', async () => {
    // „runs it" plans a register step first, then a web step.
    readLabels.mockResolvedValue(new Map([[PHONE, { ...oneCompanyWord(), runs_it: true }]]));
    withDatabase();

    const result = await runResearchOnce();

    const register = stepsWritten().find((s) => s.source === 'register');
    expect(register?.status).toBe('not_attempted');
    expect(register?.note).toContain('no register integration');
    expect(result.not_attempted).toBe(1);
    expect(result.verdict).toContain('not as nothing found');
    // And it was not paid for.
    expect(webSearch).toHaveBeenCalledTimes(1);
  });

  it('separates "nothing came back" from "the search failed"', async () => {
    // A startuper: two web steps and no register step, so both replies land.
    readLabels.mockResolvedValue(new Map([[PHONE, { ...oneCompanyWord(), startup_hint: true }]]));
    withDatabase();
    webSearch.mockResolvedValueOnce({ results: [] });
    webSearch.mockResolvedValueOnce({ error: 'Tavily error 429: rate limited' });

    await runResearchOnce();

    const written = stepsWritten().map((s) => s.status);
    expect(written).toContain('nothing');
    expect(written).toContain('error');
  });

  it('survives a reply whose shape is not what we expect', async () => {
    withDatabase();
    webSearch.mockResolvedValue({ unexpected: true });

    const result = await runResearchOnce();

    // Recorded as nothing found, not thrown: an upstream change must not be
    // able to kill a background job.
    expect(result.ran).toBe(true);
    const searched = stepsWritten().filter((s) => s.status !== 'not_attempted');
    expect(searched.length).toBeGreaterThan(0);
    expect(searched.every((s) => s.status === 'nothing')).toBe(true);
  });

  it('records a thrown search as an error rather than losing the step', async () => {
    withDatabase();
    webSearch.mockRejectedValue(new Error('socket hang up'));

    await runResearchOnce();

    const failed = stepsWritten().filter((s) => s.status === 'error');
    expect(failed.length).toBeGreaterThan(0);
    expect(failed[0].note).toContain('socket hang up');
  });
});

describe('it records evidence and never a claim about a person', () => {
  it('stores the page url and the page words, nothing derived from them', async () => {
    withDatabase();

    await runResearchOnce();

    const insert = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO research_findings'),
    );
    const payload = JSON.parse(String((insert?.[1] as unknown[])[2])) as {
      url: string;
      snippet: string;
    }[];
    expect(payload[0].url).toBe('https://example.ge/levan');
    expect(payload[0].snippet).toBe('a page said this');
  });

  it('writes to no table that holds anything about a contact', async () => {
    withDatabase();
    await runResearchOnce();

    const writes = statements.filter((s) => /INSERT|UPDATE|DELETE/i.test(s));
    expect(writes.length).toBeGreaterThan(0);
    for (const sql of writes) {
      expect(sql).toMatch(/INSERT INTO research_(steps|findings)/);
      // The tables a conclusion about a person would have to land in.
      expect(sql).not.toMatch(/contact_facts|UserAlias|contact_insights|"User"/i);
    }
  });

  it('searches the name the crowd agreed on, not the label with the firm glued on', async () => {
    withDatabase();

    await runResearchOnce();

    // The first live run of the plan searched for „Levan Shalamberidze Axel
    // Member" because it used the label. The name tokens are why it does not.
    expect(webSearch).toHaveBeenCalledWith('levan shalamberidze axel');
  });

  it('narrows a linkedin step to the site rather than pretending to have an API', async () => {
    readLabels.mockResolvedValue(
      new Map([[PHONE, { ...oneCompanyWord(), in_big_organisation: true }]]),
    );
    withDatabase();

    await runResearchOnce();

    expect(webSearch).toHaveBeenCalledWith(expect.stringContaining('site:linkedin.com'));
  });
});
