jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import {
  ListPerson,
  sameNamePerson,
  storeListPerson,
  usableListPerson,
} from '../listPeople.service';

/**
 * 4126 item 3 (D757 point 2; Misho's yes §133): people from public member
 * lists, apart from contacts — name, organisation, role, source and date only.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;

const ENTRY: ListPerson = {
  name: '  Nino  Beridze ',
  organisation: 'Georgian Bar Association',
  listedRole: 'member',
  sourceUrl: 'https://gba.ge/members',
  checkedOn: '2026-10-12',
};

beforeEach(() => mockQuery.mockReset());

describe('what an entry may hold', () => {
  it('keeps the five fields, spaces tidied', () => {
    expect(usableListPerson(ENTRY)).toEqual({ ...ENTRY, name: 'Nino Beridze' });
  });

  it('refuses an entry without a real source or date', () => {
    expect(usableListPerson({ ...ENTRY, sourceUrl: 'gba.ge' })).toBeNull();
    expect(usableListPerson({ ...ENTRY, checkedOn: '12 Oct' })).toBeNull();
    expect(usableListPerson({ ...ENTRY, organisation: ' ' })).toBeNull();
  });

  it('has no column for a phone of its own or a photo, and is no route', () => {
    const migration = readFileSync(
      join(__dirname, '..', '..', 'db', 'postgres', 'migrations', '238_list_people.sql'),
      'utf8',
    );
    const columns = migration
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(columns).not.toMatch(/photo|avatar|\bphone\s+TEXT/iu);
    expect(migration).toContain('never a „knows" link and never an introduction route');
  });
});

describe('the same-name check', () => {
  const nino = {
    phone: '+995599000001',
    name: 'nino beridze',
    organisations: ['Georgian Bar Association'],
  };

  it('joins one known person with the same name and the same organisation', () => {
    expect(sameNamePerson(ENTRY, [nino])).toBe('+995599000001');
  });

  it('leaves it unmerged on a shared name alone', () => {
    expect(sameNamePerson(ENTRY, [{ ...nino, organisations: ['TBC Bank'] }])).toBeNull();
  });

  it('leaves it unmerged when two people fit', () => {
    expect(sameNamePerson(ENTRY, [nino, { ...nino, phone: '+995599000002' }])).toBeNull();
  });
});

describe('storeListPerson', () => {
  it('stores a usable entry once, with its match', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as never);
    await expect(storeListPerson(ENTRY, null)).resolves.toBe(true);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('ON CONFLICT DO NOTHING');
    expect(params).toEqual([
      'Nino Beridze',
      'Georgian Bar Association',
      'member',
      'https://gba.ge/members',
      '2026-10-12',
      null,
    ]);
  });

  it('writes nothing for a malformed entry', async () => {
    await expect(storeListPerson({ ...ENTRY, sourceUrl: 'x' }, null)).resolves.toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
