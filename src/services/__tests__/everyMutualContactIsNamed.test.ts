import { readFileSync } from 'fs';
import { join } from 'path';
jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../tools/membership', () => ({
  __esModule: true,
  fetchAccountStates: jest.fn(),
  isMemberPhone: (states: Map<string, string>, phone: string) => states.get(phone) === 'netai_user',
}));

import { query } from '../../db/postgres/client';
import { fetchAccountStates } from '../tools/membership';
import { mutualGroupsFor, mutualGroupsText } from '../mutualGroups';

const mockQuery = query as jest.MockedFunction<typeof query>;

/** #6304 (Giorgi, G-111: the template approved as written). */
describe('#6304: the first proposal names every mutual contact, in two groups', () => {
  it('writes the approved Georgian words, the target in the dative', () => {
    expect(
      mutualGroupsText(
        'თემურ ბოლოთაშვილი',
        [
          { name: 'ლიკა', onNetai: true },
          { name: 'ბესო', onNetai: true },
          { name: 'თორნიკე', onNetai: false },
        ],
        'ka',
      ),
    ).toBe(
      'თემურ ბოლოთაშვილს იცნობენ შენი ეს ნაცნობები:\n' +
        '• Netai-ზე არიან — მათ ასისტენტს პირდაპირ ვკითხავ: ლიკა, ბესო\n' +
        '• Netai-ზე არ არიან — მათ შენ თვითონ მისწერ, ან მოიწვევ: თორნიკე',
    );
  });

  it('leaves an empty group out, and says nothing when nobody was found', () => {
    expect(mutualGroupsText('Temur', [{ name: 'Lika', onNetai: true }], 'en')).toBe(
      "These contacts of yours know Temur:\n• On Netai — I'll ask their assistant directly: Lika",
    );
    expect(mutualGroupsText('Temur', [], 'ka')).toBeNull();
  });

  it('says nothing in a language whose words are not approved', () => {
    expect(mutualGroupsText('Temur', [{ name: 'Lika', onNetai: true }], 'ru')).toBeNull();
  });

  it('reads the owner’s own names for the run’s finds of the plan’s one target', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { digits: '995500000001', alias: 'ლიკა' },
        { digits: '995500000002', alias: 'თორნიკე' },
      ],
    } as never);
    (fetchAccountStates as jest.Mock).mockResolvedValue(new Map([['995500000001', 'netai_user']]));
    const plan = { routes: [{ introduction: { via_phone: 'p1', to_name: 'თემური' } }] };
    const found = [{ name: 'თემური', viaPhones: ['+995500000001', '+995500000002'] }];
    expect(await mutualGroupsFor('171', plan, found, 'ka')).toContain(
      'ვკითხავ: ლიკა\n• Netai-ზე არ არიან — მათ შენ თვითონ მისწერ, ან მოიწვევ: თორნიკე',
    );
  });

  it('is put above the introduction plan’s sentence', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('`${plan.mutualGroups}\\n\\n${sentence}`');
  });
});
