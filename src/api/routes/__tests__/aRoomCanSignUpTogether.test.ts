import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The 21 Oct launch (the tester's 60292; Misho, 15 Oct): a hundred people on
 * one room's Wi-Fi. The sign-in routes were capped at 30 per five minutes per
 * ADDRESS, which let about ten of them in.
 */
describe('the sign-in limits', () => {
  const routes = readFileSync(join(__dirname, '..', 'auth.routes.ts'), 'utf8');

  it('count the person at the old cap, and the address at fifty times it, a hundred people at once', () => {
    expect(routes).toContain('const AUTH_MAX_PER_PERSON = 30;');
    expect(routes).toContain('const AUTH_MAX_PER_ADDRESS = 1_500;');
    expect(routes).toContain("max: AUTH_MAX_PER_ADDRESS, keyBy: 'ip'");
    expect(routes).toContain("max: AUTH_MAX_PER_PERSON, keyBy: 'person'");
    expect(routes).not.toContain('authRouter.use(rateLimit({ windowMs: 5 * 60_000, max: 30 }));');
  });

  it('keep the SMS sends per person, three numbers’ hourly ten from one device (#6338)', () => {
    expect(routes).toContain('max: OTP_SEND_MAX_PER_PERSON,');
    expect(routes).toContain('const OTP_NUMBERS_PER_DEVICE = 3;');
    expect(routes).toContain(
      'const OTP_SEND_MAX_PER_PERSON = OTP_SENDS_PER_PHONE_PER_HOUR * OTP_NUMBERS_PER_DEVICE;',
    );
    expect(routes).toContain('[otp-limit] code request refused');
    expect(routes).toContain('const OTP_SEND_WINDOW_MS = 60 * 60_000;');
    const sends = routes.slice(routes.indexOf('const limitOtpSends'));
    expect(sends.slice(0, sends.indexOf('});'))).toContain("keyBy: 'person'");
  });
});
