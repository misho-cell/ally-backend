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
import { onePathPerFirstBridge, WarmPath } from '../tools/findWarmPath';
import { AccountDetails } from '../tools/membership';
import { collapseByPerson } from '../tools/mergedIdentities';
import { readFileSync } from 'fs';
import { join } from 'path';

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

  const bridge = (phone: string, name: string): WarmPath['bridges'][number] => ({
    phone,
    name,
    is_member: true,
    account_state: 'netai_user' as const,
  });

  it('is one warm path, the best ranked kept', () => {
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
    expect(
      onePathPerFirstBridge(paths, states, '+12025550199').map((p) => p.bridges[0].name),
    ).toEqual(['ბექა მაისურაძე', 'თამთა']);
  });

  it('drops a longer chain through someone already reached directly (tester 75933, F1/F2)', () => {
    const paths: WarmPath[] = [
      { hops: 2, relayable: true, bridges: [bridge('+12025550143', 'ბექა მაისურაძე 2')] },
      {
        hops: 3,
        relayable: true,
        bridges: [bridge('+12025550142', 'ბექა მაისურაძე'), bridge('+12025550144', 'თამთა')],
      },
    ];
    const states = new Map([
      ['12025550142', details(7)],
      ['12025550143', details(7)],
      ['12025550144', details(8)],
    ]);
    expect(onePathPerFirstBridge(paths, states, '+12025550199')).toHaveLength(1);
  });

  it('never makes the target’s own second number a bridge to the target', () => {
    const paths: WarmPath[] = [
      { hops: 2, relayable: true, bridges: [bridge('+12025550143', 'ბექა მაისურაძე 2')] },
      { hops: 2, relayable: true, bridges: [bridge('+12025550144', 'თამთა')] },
    ];
    const states = new Map([
      ['12025550142', details(7)],
      ['12025550143', details(7)],
      ['12025550144', details(8)],
    ]);
    expect(
      onePathPerFirstBridge(paths, states, '+12025550142').map((p) => p.bridges[0].name),
    ).toEqual(['თამთა']);
  });

  it('is one row in the owner’s name search, the best ranked kept (tester 75937, G2)', () => {
    const rows = [
      { name: 'სანდრო ტყეშელაშვილი', phone: '+12025550142' },
      { name: 'სანდრო ტყეშელაშვილი 2', phone: '+12025550143' },
      { name: 'თამთა', phone: '+12025550144' },
    ];
    const accounts = new Map([
      ['+12025550142', 'user:7'],
      ['+12025550143', 'user:7'],
    ]);
    const out = collapseByPerson(rows, (row) => accounts.get(row.phone));
    expect(out.collapsed).toBe(1);
    expect(out.rows.map((r) => r.name)).toEqual(['სანდრო ტყეშელაშვილი', 'თამთა']);
    expect(out.rows[0].also_known_numbers).toBe(1);

    const search = readFileSync(join(__dirname, '..', 'tools', 'searchContactByName.ts'), 'utf8');
    expect(search).toContain('const byAccount = collapseByPerson(named, (row) => {');
    expect(search).toContain('collapseMergedPhones(byAccount.rows)');
  });
});
