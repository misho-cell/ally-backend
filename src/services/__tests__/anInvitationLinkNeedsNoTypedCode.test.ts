import {
  forgetInvitationsForTests,
  invitationFor,
  rememberInvitation,
} from '../rememberedInvitation';

/**
 * #8185 (founder, 27 Oct): once someone has an invitation link, no code is
 * ever needed. The code the app sent with the SMS request still counts when
 * its sign-in request arrives without one.
 */
const PHONE = '+995 500 00 00 81';
const T0 = 1_761_000_000_000;

beforeEach(() => forgetInvitationsForTests());

describe('an invitation remembered from the code request', () => {
  it('is used at sign-in when the app’s request carries none', () => {
    rememberInvitation(PHONE, { referralCode: 'KC8FC24P' }, T0);
    expect(invitationFor('995500000081', {}, T0 + 5 * 60_000)).toEqual({
      referralCode: 'KC8FC24P',
    });
  });

  it('never overrides an invitation the request itself carries', () => {
    rememberInvitation(PHONE, { referralCode: 'KC8FC24P' }, T0);
    expect(invitationFor(PHONE, { referralCode: 'OTHER123' }, T0)).toEqual({
      referralCode: 'OTHER123',
    });
  });

  it('is gone after half an hour, and belongs to its own number only', () => {
    rememberInvitation(PHONE, { referralCode: 'KC8FC24P' }, T0);
    expect(invitationFor(PHONE, {}, T0 + 31 * 60_000)).toEqual({});
    expect(invitationFor('+995 500 00 00 82', {}, T0)).toEqual({});
  });

  it('keeps nothing for a request with no invitation', () => {
    rememberInvitation(PHONE, {}, T0);
    expect(invitationFor(PHONE, {}, T0)).toEqual({});
  });
});
