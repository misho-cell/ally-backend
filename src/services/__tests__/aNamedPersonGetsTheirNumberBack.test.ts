const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));
const mockRoster = jest.fn();
const mockPhonebooks = jest.fn();
jest.mock('../axelExport/axelData', () => ({
  readRoster: (...a: unknown[]) => mockRoster(...a),
  readPhonebooks: (...a: unknown[]) => mockPhonebooks(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  fillBasePhonesByPhonebookName,
  phonesForPeople,
} from '../basePeople/phonebookPhones.service';
import { NamePlacement } from '../companyBase/phonebookNames';
import { nameKey } from '../tools/transliterate';

/**
 * #6997 / #7525 (Misho, 29 Oct: the old key is gone, „make a new list"): a
 * person in the store with no number gets it back from the name members saved
 * them under, when that name is on one number only.
 */
const ROSTER = [{ user_id: 1, phone: '+995500000101', name: 'Nino', match_names: [] }];
const PEOPLE = {
  rows: [
    { person_key: 'a'.repeat(24), name: 'Arsen Gamogonili' },
    { person_key: 'CL-1', name: 'Zaza Mkhatvari' },
    { person_key: 'CL-2', name: 'Zaza Mkhatvari' },
    { person_key: 'CL-3', name: 'Nobody Here' },
  ],
};

beforeEach(() => {
  jest.resetAllMocks();
  mockRoster.mockResolvedValue(ROSTER);
  mockPhonebooks.mockResolvedValue([
    { owner_id: 1, contact_digits: '995500000201', label: 'Arsen Gamogonili CELA' },
    { owner_id: 1, contact_digits: '995500000202', label: 'Zaza Mkhatvari' },
  ]);
});

describe('a person in the store without a number', () => {
  it('gets the one number carrying their name; a name two people share places nobody', () => {
    const byName = new Map([
      [nameKey('Arsen Gamogonili'), { phone: '+995500000201', from: NamePlacement.Phonebook }],
      [nameKey('Zaza Mkhatvari'), { phone: '+995500000202', from: NamePlacement.Phonebook }],
    ]);
    const { phones, sharedName } = phonesForPeople(PEOPLE.rows, byName);
    expect([...phones.keys()]).toEqual(['a'.repeat(24)]);
    expect(sharedName).toBe(2);
  });

  it('writes nothing on a dry run, and only empty numbers otherwise', async () => {
    mockQuery.mockResolvedValueOnce(PEOPLE);
    const dry = await fillBasePhonesByPhonebookName(true);
    expect(dry).toMatchObject({
      without_number: 4,
      by_phonebook_name: 1,
      by_member_name: 0,
      shared_name: 2,
      written: 0,
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);

    mockQuery.mockResolvedValueOnce(PEOPLE).mockResolvedValueOnce({ rowCount: 1 });
    const wet = await fillBasePhonesByPhonebookName(false);
    expect(wet.written).toBe(1);
    const [sql] = mockQuery.mock.calls[2] as [string];
    expect(sql).toContain('p.phone IS NULL');
  });

  it('has an admin route that requires dry_run', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    const route = routes.slice(routes.indexOf("'/base-people/phonebook-phones'"));
    expect(route).toContain("typeof dryRun !== 'boolean'");
    expect(route).toContain('fillBasePhonesByPhonebookName(dryRun)');
  });
});
