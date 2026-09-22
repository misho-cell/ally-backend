/**
 * ROW 229 — three weeks in which nothing was attributed, and the one class of
 * cause a backend can remove without ever seeing the client.
 *
 * `/referral/opened` learned this the expensive way: the deployed /join page
 * sent `{referralCode}` while the route demanded `{code}`, every real page load
 * was rejected 400, and the funnel never moved. Registration was left on one
 * spelling — and it is the route where the same mistake costs the most and
 * shows the least. A rejected page load is a 400 somebody can see. A
 * registration whose code arrives under the wrong key is not an error at all:
 * the field is `undefined`, the gate falls through to `mode: 'open'`, the
 * account is created, the person is let in, and the inviter is gone for good.
 *
 * Measured 22 September: last attributed registration 31 August 14:36; since
 * then 25 registrations and zero attributed — while `referral_link_events`
 * holds fifteen `opened` rows in that same window, and `recordLinkOpened`
 * writes one ONLY when the code resolves. So resolvable codes do reach this
 * server in this window. That eliminates „the code is invalid"; it does not
 * prove which name the client uses, and nothing here claims it does.
 */
jest.mock('../../../db/postgres/client', () => ({
  query: jest.fn(),
  __esModule: true,
  default: { end: jest.fn() },
}));

import { referralCodeFrom, REFERRAL_CODE_KEYS } from '../auth.routes';

describe('a referral code is read under any spelling the client sends', () => {
  it.each(REFERRAL_CODE_KEYS)('accepts %s', (key) => {
    expect(referralCodeFrom({ phone: '+995500000000', [key]: 'ABCD2345' })).toEqual({
      code: 'ABCD2345',
      key,
    });
  });

  /**
   * `ref` is in the list because it is the spelling the LINK carries —
   * `getInviteLink` writes `/join?ref=CODE`. A page handing its own query
   * parameter straight through is the likeliest shape of this bug.
   */
  it('includes the spelling the invite link itself uses', () => {
    expect(REFERRAL_CODE_KEYS).toContain('ref');
  });

  it('trims, because a link pasted with a space is still that person’s code', () => {
    expect(referralCodeFrom({ code: '  ABCD2345 ' }).code).toBe('ABCD2345');
  });

  /**
   * The canonical name wins, so a body carrying both cannot change meaning
   * depending on key order. Order is the declared order, not the object's.
   */
  it('prefers the canonical name when more than one is present', () => {
    const got = referralCodeFrom({ ref: 'FROMREF1', code: 'FROMCODE', referralCode: 'CANONICAL' });

    expect(got).toEqual({ code: 'CANONICAL', key: 'referralCode' });
  });

  /** An empty string is not a code, and must not mask a real one beside it. */
  it('steps over an empty value to reach a real one', () => {
    expect(referralCodeFrom({ referralCode: '   ', ref: 'ABCD2345' })).toEqual({
      code: 'ABCD2345',
      key: 'ref',
    });
  });

  it.each([
    ['nothing at all', {}],
    ['only unrelated fields', { phone: '+995500000000', name: 'X' }],
    ['a non-string code', { referralCode: 12345 }],
    ['a null body', null],
    ['a string body', 'referralCode=ABCD2345'],
  ])('reports no code for %s', (_label, body) => {
    expect(referralCodeFrom(body)).toEqual({});
  });

  /**
   * THE KEY IS RETURNED AND THE CODE IS NOT LOGGED. A referral code is a
   * credential and belongs in a log no more than a phone number does (D149);
   * a field NAME is not one, and „which spelling arrived" is the single fact
   * three weeks of silence could not answer.
   */
  it('names which spelling carried it, so the next registration says so', () => {
    expect(referralCodeFrom({ ref: 'ABCD2345' }).key).toBe('ref');
    expect(referralCodeFrom({}).key).toBeUndefined();
  });
});
