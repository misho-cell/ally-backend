jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../membership', () => ({
  __esModule: true,
  fetchAccountStates: jest.fn(() => Promise.resolve(new Map())),
  isMemberPhone: () => false,
  accountStateFor: () => 'none',
}));
jest.mock('../../ownerTies', () => ({
  ...jest.requireActual('../../ownerTies'),
  ownerTiesTo: jest.fn(),
}));

import { query } from '../../../db/postgres/client';
import { OwnerTieReason, ownerTiesTo } from '../../ownerTies';
import { closestFirst, listMyContacts, MyContact } from '../listMyContacts';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockTies = ownerTiesTo as jest.MockedFunction<typeof ownerTiesTo>;

function contact(phone: string, name: string): MyContact {
  return { name, phone, is_member: false, account_state: 'none' };
}

const tie = (
  reason: OwnerTieReason | null,
): { closeness: number; reason: OwnerTieReason | null } => ({
  closeness: 0.9,
  reason,
});

/** The tester's 68852/68855: „Ia is my sister, very close" — then „who are my closest people?". */
describe('#5974: the people the owner is closest to come first, marked why', () => {
  it('puts said-close, then family, then close first; the rest keep their order', () => {
    const list = [
      contact('+995500000001', 'ანა'),
      contact('+995500000002', 'ბონდო'),
      contact('+995500000003', 'ია'),
      contact('+995500000004', 'ტატო'),
      contact('+995500000005', 'ზურა'),
    ];
    const ties = new Map([
      ['995500000003', tie(OwnerTieReason.Family)],
      ['995500000005', tie(OwnerTieReason.SaidClose)],
      ['995500000002', tie(OwnerTieReason.DealtWith)],
    ]);
    const ordered = closestFirst(list, ties);
    expect(ordered.map((c) => c.name)).toEqual(['ზურა', 'ია', 'ანა', 'ბონდო', 'ტატო']);
    expect(ordered[0].your_tie).toBe(OwnerTieReason.SaidClose);
    expect(ordered[1].your_tie).toBe(OwnerTieReason.Family);
    expect(ordered[3]).not.toHaveProperty('your_tie');
  });

  it('lists as before when the ties cannot be read', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockQuery.mockImplementation((sql: string) =>
      Promise.resolve(
        (String(sql).includes('COUNT(DISTINCT phone)')
          ? { rows: [{ total: '2' }] }
          : String(sql).includes('"UserTags"')
            ? { rows: [] }
            : {
                rows: [
                  { phone: '+995500000002', alias: 'ბონდო' },
                  { phone: '+995500000001', alias: 'ანა' },
                ],
              }) as never,
      ),
    );
    mockTies.mockRejectedValueOnce(new Error('timeout'));
    const listed = await listMyContacts('171');
    expect(listed.contacts.map((c) => c.name)).toEqual(['ანა', 'ბონდო']);
    warn.mockRestore();
  });
});
