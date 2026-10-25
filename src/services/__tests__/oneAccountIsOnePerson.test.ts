jest.mock('../../db/postgres/client', () => ({ query: jest.fn() }));
jest.mock('../tools/membership', () => ({
  __esModule: true,
  fetchAccountStates: jest.fn(),
  accountDetailsFor: (states: Map<string, { user_id: number | null }>, phone: string) =>
    states.get(phone.replace(/\D/g, '')) ?? { user_id: null },
  accountStateFor: () => 'netai_user',
  isMemberPhone: () => true,
}));

import { fetchAccountStates } from '../tools/membership';
import { onePersonPerAccount } from '../taskPlans.service';
import { onePathPerChainOfAccounts, WarmPath } from '../tools/findWarmPath';
import { AccountDetails } from '../tools/membership';

const mockStates = fetchAccountStates as jest.Mock;

const details = (userId: number): AccountDetails =>
  ({ state: 'netai_user', user_id: userId }) as unknown as AccountDetails;

/** #7630 (tester 75928): one bridge saved as „X" and „X 2", two numbers of one account. */
describe('one account is one person', () => {
  beforeEach(() => mockStates.mockReset());

  it('stands in the plan once, the first entry kept', async () => {
    mockStates.mockResolvedValue(
      new Map([
        ['12025550142', details(7)],
        ['12025550143', details(7)],
        ['12025550144', details(8)],
      ]),
    );
    const people = [
      { name: 'სანდრო ტყეშელაშვილი', phone: '+12025550142', route: 'r' },
      { name: 'სანდრო ტყეშელაშვილი 2', phone: '+12025550143', route: 'r' },
      { name: 'თამთა', phone: '+12025550144', route: 'r' },
    ];
    const once = await onePersonPerAccount(people as never);
    expect(once.map((p) => p.name)).toEqual(['სანდრო ტყეშელაშვილი', 'თამთა']);
  });

  it('keeps everyone when the accounts cannot be read', async () => {
    mockStates.mockRejectedValue(new Error('timeout'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const people = [
      { name: 'ა', phone: '+12025550142', route: 'r' },
      { name: 'ა 2', phone: '+12025550143', route: 'r' },
    ];
    await expect(onePersonPerAccount(people as never)).resolves.toHaveLength(2);
    warn.mockRestore();
  });

  it('is one warm path, the best ranked kept', () => {
    const bridge = (phone: string, name: string) => ({
      phone,
      name,
      is_member: true,
      account_state: 'netai_user' as const,
    });
    const paths: WarmPath[] = [
      { hops: 2, relayable: true, bridges: [bridge('+12025550142', 'ბექა მაისურაძე')] },
      { hops: 2, relayable: true, bridges: [bridge('+12025550143', 'ბექა მაისურაძე 2')] },
      { hops: 2, relayable: true, bridges: [bridge('+12025550144', 'თამთა')] },
    ];
    const states = new Map([
      ['12025550142', details(7)],
      ['12025550143', details(7)],
      ['12025550144', details(8)],
    ]);
    expect(onePathPerChainOfAccounts(paths, states).map((p) => p.bridges[0].name)).toEqual([
      'ბექა მაისურაძე',
      'თამთა',
    ]);
  });
});
