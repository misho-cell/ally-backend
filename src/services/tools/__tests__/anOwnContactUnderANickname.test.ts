jest.mock('../../../db/postgres/client', () => ({
  query: jest.fn(),
  __esModule: true,
}));

jest.mock('../../block.service', () => ({
  __esModule: true,
  getExcludedPhones: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../insights.service', () => ({
  __esModule: true,
  getContactInsight: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../contactFacts.service', () => ({
  __esModule: true,
  getVisibleFacts: jest.fn().mockResolvedValue({ facts: [] }),
}));

jest.mock('../likelyEmployer', () => ({
  __esModule: true,
  likelyEmployerFor: jest.fn().mockResolvedValue({}),
}));

import { query } from '../../../db/postgres/client';
import { searchContactByName } from '../searchContactByName';
import { getContactFullProfile } from '../getContactFullProfile';
import { buildRawWordGroups } from '../transliterate';
import { askedWordKeys, LabelKind, NetworkLabel, networkNamesFor } from '../networkNames';
import {
  forgetNamesAsked,
  nameAskedFor,
  ownContactNote,
  rememberNameAsked,
} from '../ownContactByNumber';

/**
 * 5908 (founder P1, the tester's threads 59536/59537/59538, fictional seats):
 * three members saved one number as „Gogita / Goga / Gogi Fiktadze"; the owner
 * saved it as „Bubu" and asked „გოგიტა ფიქტაძეზე მომეცი ინფორმაცია". The search
 * found the number and the run still said it was „another name".
 */

const mockQuery = query as jest.MockedFunction<typeof query>;

const OWNER = '42';
const PHONE = '+995500000001';
const GEORGIAN_QUERY = 'გოგიტა ფიქტაძეზე';

const alias = (saverId: string, label: string): NetworkLabel => ({
  saverId,
  label,
  kind: LabelKind.Alias,
});
const tag = (saverId: string, label: string): NetworkLabel => ({
  saverId,
  label,
  kind: LabelKind.Tag,
});

const NETWORK: readonly NetworkLabel[] = [
  alias('7', 'Gogita Fiktadze'),
  alias('8', 'Goga Fiktadze'),
  alias('9', 'Gogi Fiktadze'),
  alias('10', 'Bubu'),
  alias('11', 'deda nino'),
  tag('12', 'lawyer'),
  tag('13', 'lawyer'),
];

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

function labelRows(): unknown[] {
  return NETWORK.map((l) => ({ phone: PHONE, saver_id: l.saverId, label: l.label, kind: l.kind }));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the names other members know a number by', () => {
  it('reads Latin labels for a Georgian query, case ending and all', () => {
    const asked = askedWordKeys(buildRawWordGroups(GEORGIAN_QUERY));
    expect(networkNamesFor(NETWORK, 'Bubu', asked)).toEqual([
      'Gogita Fiktadze',
      'Goga Fiktadze',
      'Gogi Fiktadze',
    ]);
  });

  it('reaches the full name from a short first name', () => {
    const asked = askedWordKeys(buildRawWordGroups('Gogi Fiktadze'));
    const single = [alias('7', 'Gogita Fiktadze')];
    expect(networkNamesFor(single, 'Bubu', asked)).toEqual(['Gogita Fiktadze']);
  });

  it('never repeats the owner’s own nickname as somebody else’s name', () => {
    const asked = askedWordKeys(buildRawWordGroups('Bubu'));
    expect(networkNamesFor(NETWORK, 'Bubu', asked)).not.toContain('Bubu');
  });

  it('keeps every word that is not a name private (row 289)', () => {
    const asked = askedWordKeys(buildRawWordGroups('Nino'));
    const names = networkNamesFor(NETWORK, 'Bubu', asked);
    expect(names).not.toContain('deda nino');
    expect(names).not.toContain('lawyer');
  });

  it('without a name asked, gives only what two members agree on, and never a tag', () => {
    const none = askedWordKeys([]);
    expect(networkNamesFor(NETWORK, 'Bubu', none)).toEqual([
      'Gogita Fiktadze',
      'Goga Fiktadze',
      'Gogi Fiktadze',
    ]);
    expect(networkNamesFor([alias('7', 'Gogita Fiktadze')], 'Bubu', none)).toEqual([]);
  });
});

describe('the name search runs in both scripts', () => {
  it('a Georgian query carries its Latin reading, and a Latin one its Georgian', () => {
    expect(buildRawWordGroups(GEORGIAN_QUERY).flat()).toEqual(
      expect.arrayContaining(['gogita', 'fiktadze']),
    );
    expect(buildRawWordGroups('Gogita Fiktadze').flat()).toEqual(
      expect.arrayContaining(['გოგიტა', 'ფიქტაძე']),
    );
  });

  it('a Georgian „გოგიტა" reaches the short forms Gogi and Goga', () => {
    expect(buildRawWordGroups('გოგიტა')[0]).toEqual(expect.arrayContaining(['gogi', 'goga']));
  });
});

describe('search_contact_by_name on an own contact saved under a nickname', () => {
  const bubu = {
    phone: PHONE,
    name: 'Bubu',
    saved_as: 'Bubu',
    own_hit: false,
    word_hits: 2,
    name_hits: 0,
    all_tags: ['lawyer'],
    own_tags: null,
    employer: null,
    jobPosition: null,
    city: null,
  };

  function setup(): void {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('AS total_matches'))
        return Promise.resolve(rows([{ ...bubu, total_matches: '1' }]) as never);
      if (sql.includes("'alias' AS kind")) return Promise.resolve(rows(labelRows()) as never);
      return Promise.resolve(rows([]) as never);
    });
  }

  it('says the number is the owner’s, under his label, with the network’s names', async () => {
    setup();
    const result = (await searchContactByName(OWNER, GEORGIAN_QUERY)) as {
      results: Array<Record<string, unknown>>;
    };
    const row = result.results[0];
    expect(row.own_contact).toEqual({
      in_your_contacts: true,
      you_saved_as: 'Bubu',
      others_know_as: ['Gogita Fiktadze', 'Goga Fiktadze', 'Gogi Fiktadze'],
      matched_through: 'number',
    });
    expect(row.own_contact_note).toContain('you have him/her saved as Bubu');
    expect(row.approximate).toBeUndefined();
  });

  it('never carries who saved a name, nor a private label', async () => {
    setup();
    const text = JSON.stringify(await searchContactByName(OWNER, GEORGIAN_QUERY));
    expect(text).not.toContain('deda nino');
    expect(text).not.toContain('saverId');
    expect(text).not.toContain('saver_id');
  });

  it('reads other members’ labels by a parameterized query with a timeout', async () => {
    setup();
    await searchContactByName(OWNER, GEORGIAN_QUERY);
    const call = mockQuery.mock.calls.find(([sql]) => String(sql).includes("'alias' AS kind"));
    expect(call?.[1]).toEqual([[PHONE], OWNER, expect.any(Number)]);
    expect(call?.[2]).toEqual(expect.any(Number));
  });
});

describe('get_contact_full_profile on that number', () => {
  function setup(isOwn: boolean): void {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('AS is_own'))
        return Promise.resolve(
          rows([{ own_label: isOwn ? 'Bubu' : null, is_own: isOwn }]) as never,
        );
      if (sql.includes("'alias' AS kind")) return Promise.resolve(rows(labelRows()) as never);
      return Promise.resolve(rows([]) as never);
    });
  }

  it('carries the names the owner asked by, so the run is not told nothing is known', async () => {
    setup(true);
    const card = await getContactFullProfile(OWNER, PHONE, undefined, GEORGIAN_QUERY);
    expect(card.own_contact?.you_saved_as).toBe('Bubu');
    expect(card.own_contact?.others_know_as).toEqual([
      'Gogita Fiktadze',
      'Goga Fiktadze',
      'Gogi Fiktadze',
    ]);
    expect(card.own_contact_note).toContain('tell what is known');
    expect(JSON.stringify(card)).not.toContain('deda nino');
  });

  it('says nothing of the network’s names on a number that is not the owner’s', async () => {
    setup(false);
    const card = await getContactFullProfile(OWNER, PHONE, undefined, GEORGIAN_QUERY);
    expect(card.own_contact).toBeUndefined();
  });
});

describe('the note and the run’s memory', () => {
  it('tells the run plainly, and forbids rejecting it as another name', () => {
    const note = ownContactNote('Bubu', ['Gogita Fiktadze']);
    expect(note).toContain('saved by the owner as „Bubu"');
    expect(note).toContain('saved as „Gogita Fiktadze"');
    expect(note).toContain('through the number');
    expect(note).toContain('Never reject it as a different name');
  });

  it('remembers the name asked for each number found, until the run ends', () => {
    rememberNameAsked('run-1', { results: [{ phone: PHONE }] }, GEORGIAN_QUERY);
    expect(nameAskedFor('run-1', '995500000001')).toBe(GEORGIAN_QUERY);
    expect(nameAskedFor('run-2', PHONE)).toBeUndefined();
    forgetNamesAsked('run-1');
    expect(nameAskedFor('run-1', PHONE)).toBeUndefined();
  });
});
