jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../../db/postgres/client';
import {
  LIST_PEOPLE_BRIEF,
  LIST_PEOPLE_ON,
  listedPeopleIn,
  newUserAsKnown,
  storeListedPeople,
} from '../listedPeople';
import { extractBrief, REGISTRATION_EXTRACT_BRIEF } from '../extract';

/**
 * 4126 item 3: the people a public member list names reach list_people — the
 * table was built and nothing wrote to it. Never a „knows" link; only the new
 * user's own entry can join a number.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const LIST_URL = 'https://example.ge/board';
const TODAY = '2026-10-12';
const NEW_USER_PHONE = '+995500000001';

const REPLY = {
  same_person: true,
  facts: [],
  listed_people: [
    { name: 'Nino Satsdeli', organisation: 'Bank A', role: 'Board member', source: LIST_URL },
    { name: 'Giorgi Testadze', organisation: 'Bank A', role: null, source: LIST_URL },
    { name: 'No Source', organisation: 'Bank A' },
  ],
};

describe('listed people from the registration run', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ships OFF, and the live brief is unchanged until it is on', () => {
    expect(LIST_PEOPLE_ON).toBe(false);
    expect(extractBrief(false)).toBe(REGISTRATION_EXTRACT_BRIEF);
    expect(extractBrief(true)).toBe(`${REGISTRATION_EXTRACT_BRIEF} ${LIST_PEOPLE_BRIEF}`);
  });

  it('reads each listed person with the page and the day, and drops an entry with no source', () => {
    expect(listedPeopleIn(REPLY, TODAY)).toEqual([
      {
        name: 'Nino Satsdeli',
        organisation: 'Bank A',
        listedRole: 'Board member',
        sourceUrl: LIST_URL,
        checkedOn: TODAY,
      },
      {
        name: 'Giorgi Testadze',
        organisation: 'Bank A',
        listedRole: null,
        sourceUrl: LIST_URL,
        checkedOn: TODAY,
      },
    ]);
  });

  it('reads nobody when the extractor was not sure the texts are about this person', () => {
    expect(listedPeopleIn({ ...REPLY, same_person: false }, TODAY)).toEqual([]);
    expect(listedPeopleIn(null, TODAY)).toEqual([]);
  });

  it('joins only the new user’s own entry to their number; the others stay unmatched', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as never);
    const newUser = newUserAsKnown(NEW_USER_PHONE, 'Nino Satsdeli', [
      { key: 'employer', value: 'Bank A' },
      { key: 'city', value: 'Tbilisi' },
    ]);
    expect(newUser.organisations).toEqual(['Bank A']);
    const stored = await storeListedPeople(listedPeopleIn(REPLY, TODAY), newUser);
    expect(stored).toBe(2);
    const matched = mockQuery.mock.calls.map((c) => (c[1] as unknown[])[5]);
    expect(matched).toEqual([NEW_USER_PHONE, null]);
    for (const call of mockQuery.mock.calls) {
      expect(String(call[0])).toContain('INSERT INTO list_people');
      expect(String(call[0])).not.toMatch(/knows|introduction/iu);
    }
  });

  it('counts a person already stored as not new', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    const newUser = newUserAsKnown(NEW_USER_PHONE, 'Someone Else', []);
    expect(await storeListedPeople(listedPeopleIn(REPLY, TODAY), newUser)).toBe(0);
  });

  it('propagates a failed write instead of counting it', async () => {
    mockQuery.mockRejectedValue(new Error('statement timeout'));
    const newUser = newUserAsKnown(NEW_USER_PHONE, 'Nino Satsdeli', []);
    await expect(storeListedPeople(listedPeopleIn(REPLY, TODAY), newUser)).rejects.toThrow(
      'statement timeout',
    );
  });
});
