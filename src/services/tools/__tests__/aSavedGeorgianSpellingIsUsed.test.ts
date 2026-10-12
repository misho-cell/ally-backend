jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../../db/postgres/client';
import { applyFacts, fetchFactsForPhones, nameAsSpelled } from '../factEnrichment';

const mockQuery = query as jest.MockedFunction<typeof query>;
const PHONE = '+995500000001';
const OWNER = '501';
const SAVED = 'ნიკა ციცქიშვილი';

function row(name: string): {
  phone: string;
  name: string;
  employer: null;
  jobPosition: null;
  city: null;
} {
  return { phone: PHONE, name, employer: null, jobPosition: null, city: null };
}

/** Box 54172/54173: a Georgian surname spelled from the Latin label came out wrong. */
describe('the owner’s saved Georgian spelling is the name shown', () => {
  beforeEach(() => mockQuery.mockReset());

  it('puts the saved spelling in place of a Latin name', () => {
    expect(nameAsSpelled('Nika Tsitskishvili', SAVED)).toBe(SAVED);
  });

  it('leaves a name that is already in Georgian, and a contact with nothing saved', () => {
    expect(nameAsSpelled('ნიკა', SAVED)).toBe('ნიკა');
    expect(nameAsSpelled('Nika', null)).toBe('Nika');
  });

  it('reads only the owner’s own georgian_name and carries it on the search row', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { phone: PHONE, field_type: 'georgian_name', value: SAVED, as_of: '2026-10-07', own: true },
        {
          phone: PHONE,
          field_type: 'georgian_name',
          value: 'სხვისი',
          as_of: '2026-10-07',
          own: false,
        },
      ],
    } as never);
    const facts = await fetchFactsForPhones(OWNER, [PHONE]);
    const shown = applyFacts(row('Nika Tsitskishvili'), facts) as {
      name: string;
      georgian_name: string;
    };
    expect(shown.name).toBe(SAVED);
    expect(shown.georgian_name).toBe(SAVED);
  });

  it('ignores another person’s georgian_name', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          phone: PHONE,
          field_type: 'georgian_name',
          value: 'სხვისი',
          as_of: '2026-10-07',
          own: false,
        },
      ],
    } as never);
    const facts = await fetchFactsForPhones(OWNER, [PHONE]);
    expect((applyFacts(row('Nika'), facts) as { name: string }).name).toBe('Nika');
  });
});
