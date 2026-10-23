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
import { mutualGroupsFor, mutualGroupsText, namesTheTarget } from '../mutualGroups';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => {
  mockQuery.mockReset();
  (fetchAccountStates as jest.Mock).mockReset();
});

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

  it('finds the target under the other spelling the search found him by (69134)', async () => {
    expect(namesTheTarget('Zura Kvaratskhelia', 'ზურაბ კვარაცხელია')).toBe(true);
    expect(namesTheTarget('ზურაბ კვარაცხელია Kartuli Logistics', 'ზურაბ კვარაცხელია')).toBe(true);
    expect(namesTheTarget('ნიკა ბერიძე', 'ზურაბ კვარაცხელია')).toBe(false);

    mockQuery.mockResolvedValue({
      rows: [
        { digits: '995500000001', alias: 'ლიკა' },
        { digits: '995500000002', alias: 'ბესო' },
        { digits: '995500000003', alias: 'ლადო' },
      ],
    } as never);
    (fetchAccountStates as jest.Mock).mockResolvedValue(
      new Map([
        ['995500000001', 'netai_user'],
        ['995500000002', 'netai_user'],
      ]),
    );
    const plan = {
      routes: [
        { introduction: { via_phone: '+995500000001', to_name: 'ზურაბ კვარაცხელია' } },
        { introduction: { via_phone: '+995500000002', to_name: 'ზურაბ კვარაცხელია' } },
      ],
    };
    const found = [{ name: 'Zura Kvaratskhelia', viaPhones: ['+995500000003'] }];
    const text = await mutualGroupsFor('171', plan, found, 'ka', true);
    expect(text).toContain('ვკითხავ: ლიკა, ბესო');
    expect(text).toContain('მოიწვევ: ლადო');
    // Giorgi's template: one reason sentence, for the first bridge.
    expect(text).toContain('ლიკა ზურაბ კვარაცხელიას იცნობს.');
  });

  it('keeps the plan’s own go-betweens even when the search found nobody', async () => {
    mockQuery.mockResolvedValue({ rows: [{ digits: '995500000001', alias: 'ლიკა' }] } as never);
    (fetchAccountStates as jest.Mock).mockResolvedValue(new Map([['995500000001', 'netai_user']]));
    const plan = { routes: [{ introduction: { via_phone: '+995500000001', to_name: 'თემური' } }] };
    const text = await mutualGroupsFor('171', plan, [], 'ka');
    expect(text).toContain('ვკითხავ: ლიკა');
    expect(text).not.toContain('იცნობს.');
  });

  it('adds the non-member saved in both the owner’s and the target’s book (69268)', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ digits: '995500000002' }, { digits: '995500000003' }],
      } as never)
      .mockResolvedValueOnce({
        rows: [
          { digits: '995500000001', alias: 'ლიკა' },
          { digits: '995500000003', alias: 'ლადო' },
        ],
      } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    (fetchAccountStates as jest.Mock)
      .mockResolvedValueOnce(new Map([['995500000002', 'netai_user']]))
      .mockResolvedValueOnce(new Map([['995500000001', 'netai_user']]));
    const plan = { routes: [{ introduction: { via_phone: '+995500000001', to_name: 'თემური' } }] };
    const found = [{ name: 'თემური', viaPhones: ['+995500000001'], phone: '+995500000009' }];
    const text = await mutualGroupsFor('171', plan, found, 'ka');
    expect(text).toContain(
      'ვკითხავ: ლიკა\n• Netai-ზე არ არიან — მათ შენ თვითონ მისწერ, ან მოიწვევ: ლადო',
    );
    expect(mockQuery.mock.calls[0][1]).toEqual(['171', ['995500000009'], 12]);
  });

  // #6899 third pass (tester 00:00Z): the heading named the target by the warmest friend's label.
  it('names the person sought by the name part of the planned go-between label', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ digits: '995500000001', alias: 'მაკა' }] } as never)
      .mockResolvedValueOnce({ rows: [{ alias: 'ლევან ელექტრიკოსი Ally' }] } as never);
    (fetchAccountStates as jest.Mock).mockResolvedValueOnce(
      new Map([['995500000001', 'netai_user']]),
    );
    const plan = { routes: [{ introduction: { via_phone: '+995500000001', to_name: 'ამირან' } }] };
    const found = [{ name: 'ამირან', viaPhones: ['+995500000001'], phone: '+995500000009' }];
    const text = await mutualGroupsFor('171', plan, found, 'ka');
    expect(text).toContain('ლევანს იცნობენ');
    expect(text).not.toContain('ელექტრიკოს');
    expect(text).not.toContain('ამირან');
    expect(mockQuery.mock.calls[2][1]).toEqual(['995500000001', '995500000009']);
  });

  it('says a name once when the owner saved that friend under two numbers (69268)', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { digits: '995500000001', alias: 'ლიკა' },
        { digits: '995500000002', alias: 'ბესო' },
        { digits: '995500000003', alias: 'ბესო' },
      ],
    } as never);
    (fetchAccountStates as jest.Mock).mockResolvedValue(
      new Map([
        ['995500000001', 'netai_user'],
        ['995500000003', 'netai_user'],
      ]),
    );
    const plan = { routes: [{ introduction: { via_phone: '+995500000001', to_name: 'თემური' } }] };
    const found = [{ name: 'თემური', viaPhones: ['+995500000002', '+995500000003'] }];
    const text = await mutualGroupsFor('171', plan, found, 'ka');
    expect(text).toContain('ვკითხავ: ლიკა, ბესო');
    expect(text).not.toContain('მოიწვევ');
  });

  it('draws the groups when the plan names its go-betweens but no introduction (61547)', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { digits: '995500000001', alias: 'Eka Sharashidze' },
        { digits: '995500000002', alias: 'Luka Gelovani' },
      ],
    } as never);
    (fetchAccountStates as jest.Mock).mockResolvedValue(
      new Map([
        ['995500000001', 'netai_user'],
        ['995500000002', 'netai_user'],
      ]),
    );
    const plan = {
      routes: [{ name: 'ეკას გავლით' }, { name: 'ლუკას გავლით' }],
      people_to_involve: [
        { name: 'ეკა შარაშიძე', phone: '+995500000001' },
        { name: 'ლუკა გელოვანი', phone: '+995500000002' },
      ],
    };
    const found = [{ name: 'მერაბ ჩიქოვანი', viaPhones: ['+995500000001', '+995500000002'] }];
    const text = await mutualGroupsFor('171', plan, found, 'ka', true);
    expect(text).toContain('მერაბ ჩიქოვანს იცნობენ შენი ეს ნაცნობები:');
    expect(text).toContain('ვკითხავ: Eka Sharashidze, Luka Gelovani');
    expect(text).toContain('Eka Sharashidze მერაბ ჩიქოვანს იცნობს.');
  });

  it('draws nothing when the go-betweens lead to two different people', async () => {
    const plan = { people_to_involve: [{ name: 'ეკა', phone: '+995500000001' }] };
    const found = [
      { name: 'მერაბ ჩიქოვანი', viaPhones: ['+995500000001'] },
      { name: 'ნიკა ბერიძე', viaPhones: ['+995500000001'] },
    ];
    expect(await mutualGroupsFor('171', plan, found, 'ka')).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  // Box 70023 (Misho's yes 17:00Z): a KIND of person, several found, none the one target.
  it('draws the groups for a kind of person the search found several of', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { digits: '995500000001', alias: 'ბესო' },
        { digits: '995500000002', alias: 'ნინო' },
      ],
    } as never);
    (fetchAccountStates as jest.Mock).mockResolvedValue(new Map([['995500000001', 'netai_user']]));
    const plan = {
      people_to_involve: [
        { name: 'ბესო', phone: '+995500000001' },
        { name: 'ნინო', phone: '+995500000002' },
      ],
    };
    const found = [
      { name: 'გია', viaPhones: ['+995500000001'], sought: 'არქიტექტორი' },
      { name: 'ზურა', viaPhones: ['+995500000002'], sought: 'არქიტექტორი' },
    ];
    const text = await mutualGroupsFor('171', plan, found, 'ka', true);
    expect(text).toBe(
      'არქიტექტორს იცნობენ შენი ეს ნაცნობები:\n' +
        '• Netai-ზე არიან — მათ ასისტენტს პირდაპირ ვკითხავ: ბესო\n' +
        '• Netai-ზე არ არიან — მათ შენ თვითონ მისწერ, ან მოიწვევ: ნინო\n' +
        'ბესო არქიტექტორს იცნობს.',
    );
  });

  it('draws nothing when the people found were found by different searches', async () => {
    const plan = { people_to_involve: [{ name: 'ბესო', phone: '+995500000001' }] };
    const found = [
      { name: 'გია', viaPhones: ['+995500000001'], sought: 'არქიტექტორი' },
      { name: 'ზურა', viaPhones: ['+995500000001'], sought: 'ნოტარიუსი' },
    ];
    expect(await mutualGroupsFor('171', plan, found, 'ka')).toBeNull();
  });

  it('is put above the introduction plan’s sentence', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('`${plan.mutualGroups}\\n\\n${sentence}`');
    expect(chat).toContain('introSentence === null,');
  });
});
