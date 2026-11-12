jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../../block.service', () => ({
  __esModule: true,
  getExcludedPhones: jest.fn().mockResolvedValue([]),
}));

import { query } from '../../../db/postgres/client';
import { searchContactByName } from '../searchContactByName';

const mockQuery = query as jest.MockedFunction<typeof query>;
const TIMEOUT = new Error('canceling statement due to statement timeout');
const QUICK_SQL = 'SELECT DISTINCT ON (phone) phone, alias FROM "UserAlias"';
const MEMBERSHIP_SQL = 'FROM "UserPhone" up';
const MEMBER_PHONE = '+995555000111';
const OUTSIDER_PHONE = '+995555000222';

const rows = (data: unknown[]): never => ({ rows: data, rowCount: data.length }) as never;

interface QuickResult {
  readonly name: string;
  readonly is_member?: boolean;
  readonly account_state?: string;
}

/** The full search runs out of time; the quick read and the membership read answer as given. */
function fullSearchTimesOut(membership: () => Promise<never>): void {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes(QUICK_SQL)) {
      return Promise.resolve(
        rows([
          { phone: MEMBER_PHONE, alias: 'Nino Beridze' },
          { phone: OUTSIDER_PHONE, alias: 'Nino Kapanadze' },
        ]),
      );
    }
    if (sql.includes(MEMBERSHIP_SQL)) return membership();
    return Promise.reject(TIMEOUT);
  });
}

async function quickResults(): Promise<readonly QuickResult[]> {
  const result = (await searchContactByName('42', 'Nino')) as { results: QuickResult[] };
  return result.results;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

/**
 * Giorgi, 9 Nov (#3): the name search ran out of time, the quick rows carried no
 * word of who is on Netai, and the run offered to write to someone it could not.
 */
describe('a name search that ran out of time', () => {
  it('still says who of the people found is on Netai', async () => {
    fullSearchTimesOut(() =>
      Promise.resolve(
        rows([
          {
            phone: MEMBER_PHONE,
            user_id: 7,
            netai_user: true,
            netai_subscriber: false,
            old_ally_paid: false,
          },
        ]),
      ),
    );

    const [member, outsider] = await quickResults();

    expect(member).toMatchObject({ name: 'Nino Beridze', is_member: true });
    expect(outsider).toMatchObject({ name: 'Nino Kapanadze', is_member: false });
    expect(outsider?.account_state).toBe('none');
  });

  it('claims nothing about membership when that read fails too', async () => {
    fullSearchTimesOut(() => Promise.reject(TIMEOUT));

    const found = await quickResults();

    expect(found).toHaveLength(2);
    for (const person of found) expect(person.is_member).toBeUndefined();
  });
});
