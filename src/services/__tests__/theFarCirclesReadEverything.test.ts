jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../tools/findWarmPath', () => ({ __esModule: true, namesFor: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';

import { query } from '../../db/postgres/client';
import { namesFor } from '../tools/findWarmPath';
import { farMembersHolding } from '../farCircles.service';
import { normalizePhone } from '../phone';
import { MATCHED_RESEARCH_STATUSES, RESEARCH_SOURCE } from '../researchFactsView';
import { PROFILE_KEYS_MATCHED, SENSITIVE_FACT_TYPES } from '../tools/searchableData';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockNames = namesFor as jest.MockedFunction<typeof namesFor>;

const OWNER = 186272;
/** owner → L1 → L2 → L3 → L4, each saving only the next. */
const CHAIN = [186273, 186274, 186275, 186276];
const FOUND_PHONE = '995599777000';
const phoneOf = (id: number): string => `99559900${id}`;

/** The walk along CHAIN; `holder` saved the person searched for. */
function routeChain(holder: number | null): void {
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    const ring = (params?.[0] ?? []) as number[];
    if (sql.includes('DISTINCT ON (up."userId")')) {
      const rows = ring.flatMap((id) => {
        const next = id === OWNER ? CHAIN[0] : CHAIN[CHAIN.indexOf(id) + 1];
        return next === undefined ? [] : [{ from_id: id, user_id: next, phone: phoneOf(next) }];
      });
      return { rows } as never;
    }
    if (sql.includes('WITH ORDINALITY')) return { rows: [] } as never;
    if (sql.includes('~ ALL')) {
      const rows =
        holder !== null && ring.includes(holder)
          ? [{ holder_id: holder, phone: FOUND_PHONE, alias: 'Nino Beridze' }]
          : [];
      return { rows } as never;
    }
    throw new Error(`unexpected query: ${sql}`);
  });
}

function searchedRings(): unknown[] {
  return mockQuery.mock.calls
    .filter(([sql]) => String(sql).includes('~ ALL'))
    .map(([, params]) => (params as unknown[])[0]);
}

/**
 * Misho, 13 Nov („every level should read the way my own contacts are read",
 * then „make all 5 levels work well"): levels 3-5 matched only what a holder
 * saved someone under. They now read what the person is known for, by the
 * same rule as the nearer circles.
 */
describe('the far circles', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockNames.mockReset();
    mockNames.mockImplementation(
      async (_owner: string, phones: string[]) =>
        new Map(phones.map((phone, i) => [normalizePhone(phone), `link ${i + 1}`])) as never,
    );
  });

  it('read facts, the member’s profile and active offers, besides labels and tags', async () => {
    routeChain(null);

    await farMembersHolding(OWNER, 'freelance sales');

    const [sql, params] = mockQuery.mock.calls.find(([s]) => String(s).includes('~ ALL')) ?? [];
    expect(String(sql)).toContain('FROM contact_facts cf');
    expect(String(sql)).toContain('FROM user_profile_kv kv');
    expect(String(sql)).toContain('FROM offers o');
    expect(String(sql)).toContain('cf.removed_by_subject_at IS NULL');
    expect((params as unknown[]).slice(3)).toEqual([
      SENSITIVE_FACT_TYPES,
      RESEARCH_SOURCE,
      MATCHED_RESEARCH_STATUSES,
      PROFILE_KEYS_MATCHED,
    ]);
  });

  it('start one ring out for a name search, whose second circle was never searched', async () => {
    routeChain(CHAIN[0]);

    const found = await farMembersHolding(OWNER, 'Nino Beridze', 1);

    expect(searchedRings()[0]).toEqual([CHAIN[0]]);
    expect(found.map((hit) => hit.phone)).toEqual([normalizePhone(FOUND_PHONE)]);
  });

  it('still skip the second circle for a search that has just read it', async () => {
    routeChain(CHAIN[0]);

    const found = await farMembersHolding(OWNER, 'Nino Beridze');

    expect(searchedRings()[0]).toEqual([CHAIN[1]]);
    expect(found).toEqual([]);
  });
});

describe('the far circles in the chat', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('are searched by the name search from the second circle on', () => {
    expect(chat).toContain('const NAME_SEARCH_FIRST_RING = 1;');
    expect(chat).toContain('runId,\n          { firstRing: NAME_SEARCH_FIRST_RING },\n        );');
  });

  it('are searched every time, not only when the second circle found nobody', () => {
    expect(chat).toContain(
      "withWarmRoutes(userId, input['tag_query'], found, runId).then((warm) =>\n" +
        "              withFurtherOut(userId, input['tag_query'], warm, runId, { meanings }),",
    );
  });

  it('never repeat a person the result already shows', () => {
    expect(chat).toContain('const shown = phonesShownIn(found);');
    expect(chat).toContain('.further_out.filter((hit) => !shown.has(phoneDigits(hit.phone)));');
  });
});
