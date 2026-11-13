jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';

import { query } from '../../../db/postgres/client';
import { MATCHED_RESEARCH_STATUSES, RESEARCH_SOURCE } from '../../researchFactsView';
import {
  NEEDS_NOTE,
  NEEDS_SHOWN,
  NeedHit,
  NeedLevel,
  NeedRow,
  nearestFirst,
  needHit,
  searchNeeds,
} from '../searchNeeds';

const mockQuery = query as jest.MockedFunction<typeof query>;

const OWNER = '186272';

function row(overrides: Partial<NeedRow>): NeedRow {
  return {
    phone: '995599000111',
    shown: null,
    own_name: null,
    in_own_book: false,
    registered_name: null,
    via_name: null,
    via_holds: false,
    ...overrides,
  };
}

/**
 * Misho, 13 Nov (search stage 4): „who needs a mobile app" finds the people
 * LOOKING for it, the owner's own contacts first, then one ring out, then the
 * rest of the base.
 */
describe('a need finds its people', () => {
  beforeEach(() => mockQuery.mockReset());

  it('puts a person in the owner’s phonebook in the own ring, under the owner’s label', () => {
    const hit = needHit(
      row({ in_own_book: true, own_name: 'Nino Beridze', registered_name: 'N B' }),
    );
    expect(hit.level).toBe(NeedLevel.Own);
    expect(hit.name).toBe('Nino Beridze');
    expect(hit.via).toBeNull();
  });

  it('keeps a contact saved with no label in the own ring', () => {
    expect(needHit(row({ in_own_book: true })).level).toBe(NeedLevel.Own);
  });

  it('names the contact who knows a second-circle person', () => {
    const hit = needHit(
      row({ via_holds: true, via_name: 'Levan Japaridze', registered_name: 'Mariam Lomidze' }),
    );
    expect(hit.level).toBe(NeedLevel.Second);
    expect(hit.via).toBe('Levan Japaridze');
    expect(hit.name).toBe('Mariam Lomidze');
  });

  it('leaves everyone else further out, for find_warm_path', () => {
    const hit = needHit(row({}));
    expect(hit.level).toBe(NeedLevel.Further);
    expect(hit.via).toBeNull();
  });

  it('carries the need’s words only when they may be shown', () => {
    expect(needHit(row({ shown: 'a mobile app' })).need).toBe('a mobile app');
    expect(needHit(row({})).need).toBeNull();
  });

  it('lists the nearest ring first and shows ten at most', () => {
    const further: NeedHit = needHit(row({ phone: '1' }));
    const own: NeedHit = needHit(row({ phone: '2', in_own_book: true }));
    const second: NeedHit = needHit(row({ phone: '3', via_holds: true }));
    expect(nearestFirst([further, second, own]).map((h) => h.level)).toEqual([
      NeedLevel.Own,
      NeedLevel.Second,
      NeedLevel.Further,
    ]);
    expect(nearestFirst(Array.from({ length: 15 }, () => further))).toHaveLength(NEEDS_SHOWN);
    expect(NEEDS_SHOWN).toBe(10);
  });

  it('reads needs only, by the same visibility rule as every search', async () => {
    mockQuery.mockResolvedValue({ rows: [row({ in_own_book: true })] } as never);

    const found = await searchNeeds(OWNER, 'mobile app');

    const [sql, params] = mockQuery.mock.calls[0];
    expect(params).toEqual([
      OWNER,
      ['%mobile%', '%app%'],
      'need',
      RESEARCH_SOURCE,
      MATCHED_RESEARCH_STATUSES,
      expect.any(Number),
    ]);
    expect(sql).toContain('cf.removed_by_subject_at IS NULL');
    expect(sql).toContain('cf.is_public OR cf.is_matchable');
    expect(sql).toContain('excluded_holders');
    expect(found.results).toHaveLength(1);
    expect(found.note).toBe(NEEDS_NOTE);
  });

  it('shows a private need’s words to nobody but the person who saved it', async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);
    await searchNeeds(OWNER, 'investor');
    expect(String(mockQuery.mock.calls[0][0])).toContain(
      'CASE WHEN cf.is_public OR cf.submitted_by_user_id = $1::text THEN cf.value END',
    );
  });

  it('never lists the owner as needing something', async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);
    await searchNeeds(OWNER, 'investor');
    expect(String(mockQuery.mock.calls[0][0])).toContain('me."userId" = $1::int');
  });

  it('reads nothing for words too short to mean anything', async () => {
    expect((await searchNeeds(OWNER, 'ა ბ')).results).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('the needs search in the chat', () => {
  const chat = readFileSync(join(__dirname, '..', '..', 'chat.service.ts'), 'utf8');

  it('is a tool the model has', () => {
    expect(chat).toContain("name: 'search_needs',");
    expect(chat).toContain('  SEARCH_NEEDS_TOOL,\n');
  });

  it('drops the people the owner withheld, and remembers who it found', () => {
    const at = chat.indexOf("case 'search_needs': {");
    const handler = chat.slice(at, chat.indexOf('return needs;', at));
    expect(handler).toContain('withoutWithheldPeople(');
    expect(handler).toContain('notePeopleFound(runId, needs)');
  });
});

/**
 * Stage 4, company base → our people: a confirmed company tie finds its
 * person by the company's name at every level, even when nobody saved them
 * under it.
 */
describe('a company tie', () => {
  const read = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

  it('is read from confirmed ties only', () => {
    const data = read('searchableData.ts');
    expect(data).toContain("WHERE l.status = 'confirmed'");
    expect(data).toContain("concat_ws(' ', c.name_en, c.legal_name_ka, l.role)");
  });

  it('finds its person in the own circle, the second circle and further out', () => {
    expect(read('wordMatch.ts')).toContain('FROM (${COMPANY_TIES_SQL}) ct');
    expect(read('searchSecondDegree.ts')).toContain('FROM (${COMPANY_TIES_SQL}) ct');
    expect(read('..', 'farCircles.service.ts')).toContain('FROM (${COMPANY_TIES_SQL}) ct');
  });
});
