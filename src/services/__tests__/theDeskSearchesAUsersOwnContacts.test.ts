jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../tools/searchContactByName', () => ({
  __esModule: true,
  searchContactByName: jest.fn(),
}));
jest.mock('../tools/searchByTag', () => ({ __esModule: true, searchByTag: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { searchContactByName } from '../tools/searchContactByName';
import { searchByTag } from '../tools/searchByTag';
import {
  MAX_COMPANIES,
  searchUserContacts,
  UserContactsOutcome,
  withoutNumbers,
} from '../adminUserContacts.service';

/**
 * #8285 (founder 28 Oct; Misho's yes 28 Oct): the desk searches one user's own
 * contacts, as that user, with every number taken out.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockByName = searchContactByName as jest.MockedFunction<typeof searchContactByName>;
const mockByTag = searchByTag as jest.MockedFunction<typeof searchByTag>;
const exists = (found: boolean): never => ({ rows: [{ found }], rowCount: 1 }) as never;
const NINO = { phone: '+995599000001', name: 'Nino', employer: 'TBC Bank', is_member: true };
const LEVAN = { phone: '+995599000002', name: 'Levan', tags: ['TBC'], employer: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue(exists(true));
  mockByName.mockResolvedValue({ found: true, results: [NINO] });
  mockByTag.mockResolvedValue({ found: true, results: [NINO, LEVAN] });
});

describe('numbers never leave (#8285)', () => {
  it('drops number keys and number values at any depth', () => {
    expect(
      withoutNumbers({
        name: 'Nino',
        phone: '+995599000001',
        others_saved_as: [{ label: 'Nino TBC', phone_digits: '995599000001' }],
        note: '+995 599 00 00 01',
        tags: ['TBC', '599000001'],
      }),
    ).toEqual({ name: 'Nino', others_saved_as: [{ label: 'Nino TBC' }], tags: ['TBC'] });
  });
});

describe('the search (#8285)', () => {
  it('runs the user’s own name and tag searches as that user, one row per person', async () => {
    const out = await searchUserContacts(3318, ['TBC']);
    expect(mockByName).toHaveBeenCalledWith('3318', 'TBC');
    expect(mockByTag).toHaveBeenCalledWith('3318', 'TBC');
    expect(out).toEqual({
      outcome: UserContactsOutcome.Found,
      searches: [
        {
          query: 'TBC',
          count: 2,
          results: [
            { name: 'Nino', employer: 'TBC Bank', is_member: true },
            { name: 'Levan', tags: ['TBC'], employer: null },
          ],
        },
      ],
    });
    expect(JSON.stringify(out)).not.toMatch(/995599/u);
  });

  it('runs one search per company', async () => {
    const out = await searchUserContacts(3318, ['TBC', ' Bank of Georgia ', 'TBC']);
    expect(out.outcome).toBe(UserContactsOutcome.Found);
    expect(mockByTag).toHaveBeenCalledTimes(2);
    expect(mockByTag).toHaveBeenLastCalledWith('3318', 'Bank of Georgia');
  });

  it('refuses no query, too many companies, or a query too long', async () => {
    expect((await searchUserContacts(3318, [' '])).outcome).toBe(UserContactsOutcome.BadInput);
    const many = Array.from({ length: MAX_COMPANIES + 1 }, (_, i) => `Company ${i}`);
    expect((await searchUserContacts(3318, many)).outcome).toBe(UserContactsOutcome.BadInput);
    expect((await searchUserContacts(3318, ['x'.repeat(81)])).outcome).toBe(
      UserContactsOutcome.BadInput,
    );
    expect(mockByTag).not.toHaveBeenCalled();
  });

  it('refuses an account that does not exist or was deleted', async () => {
    mockQuery.mockResolvedValueOnce(exists(false));
    expect((await searchUserContacts(9, ['TBC'])).outcome).toBe(UserContactsOutcome.NoSuchUser);
    expect(String(mockQuery.mock.calls[0][0])).toContain('"deletedAt" IS NULL');
    expect(mockByTag).not.toHaveBeenCalled();
  });
});

describe('the route (#8285)', () => {
  const routes = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
    'utf8',
  );

  it('is GET /admin/users/:id/contacts, with 400, 404 and a logged admin', () => {
    const at = routes.indexOf("adminRouter.get('/users/:id/contacts'");
    expect(at).toBeGreaterThan(-1);
    const block = routes.slice(at, routes.indexOf('\n});', at));
    expect(block).toContain('res.status(400)');
    expect(block).toContain('res.status(404)');
    expect(block).toContain("searched user ${targetId}'s contacts");
    expect(block).not.toMatch(/req\.query\.q\}/u);
  });
});
