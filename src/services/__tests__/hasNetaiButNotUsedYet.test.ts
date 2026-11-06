jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { HAS_NETAI_NOT_USED_YET, netaiNotUsedYet } from '../tools/membership';

/**
 * Lika's manual test (6 Nov): Tiko had Netai and a trial and had only not typed
 * yet; the reply said „ის ჯერ Netai-ზე არ არის".
 */
const PHONE = '+995555000111';
const KEY = '995555000111';
const account = (state: 'netai_user' | 'ally_account', subscriber: boolean) =>
  new Map([
    [KEY, { state, user_id: 1, netai_subscriber: subscriber, old_ally_paid: false, staff: false }],
  ]);

describe('an account with Netai that has not written yet', () => {
  it('carries the note, never „not on Netai"', () => {
    expect(netaiNotUsedYet(account('ally_account', true), PHONE)).toEqual({
      netai_note: HAS_NETAI_NOT_USED_YET,
    });
    expect(HAS_NETAI_NOT_USED_YET).toContain('never that they are not on Netai');
  });

  it('is not added for a member or for an account without Netai', () => {
    expect(netaiNotUsedYet(account('netai_user', true), PHONE)).toEqual({});
    expect(netaiNotUsedYet(account('ally_account', false), PHONE)).toEqual({});
    expect(netaiNotUsedYet(new Map(), PHONE)).toEqual({});
  });
});
