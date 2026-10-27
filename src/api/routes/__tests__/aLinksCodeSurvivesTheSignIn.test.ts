jest.mock('../../middleware/rateLimit.middleware', () => ({
  __esModule: true,
  rateLimit:
    () =>
    (_req: unknown, _res: unknown, next: () => void): void =>
      next(),
}));
jest.mock('../../../services/auth.service', () => ({
  ...jest.requireActual('../../../services/auth.service'),
  requestOTP: jest.fn().mockResolvedValue(undefined),
  completeLogin: jest.fn().mockResolvedValue({ token: 't', isNewUser: false }),
}));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import authRouter from '../auth.routes';
import { completeLogin } from '../../../services/auth.service';
import { forgetInvitationsForTests } from '../../../services/rememberedInvitation';

/**
 * #8185 (founder, 27 Oct): an old Ally number opened an invite link, the app
 * sent the link's code with the SMS request, then signed in without it and the
 * person was asked to type the code. The code the SMS request carried counts.
 */
let server: Server;
let base: string;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/auth`;
    done();
  });
});
afterAll((done) => {
  server.close(() => done());
});
beforeEach(() => {
  jest.clearAllMocks();
  forgetInvitationsForTests();
});

const post = (path: string, body: unknown): Promise<Response> =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('the link’s code through the sign-in (#8185)', () => {
  it('reaches the sign-in when the app sends it only with the SMS request', async () => {
    expect(
      (
        await post('/request-otp', {
          phone: '+995500000081',
          actionType: 'AUTH',
          referralCode: 'KC8FC24P',
        })
      ).status,
    ).toBe(200);
    expect((await post('/complete-login', { phone: '+995500000081' })).status).toBe(200);
    expect(completeLogin).toHaveBeenCalledWith(
      '+995500000081',
      expect.objectContaining({ referralCode: 'KC8FC24P' }),
    );
  });

  it('signs in with no invitation when none was ever sent', async () => {
    await post('/complete-login', { phone: '+995500000082' });
    expect(completeLogin).toHaveBeenCalledWith(
      '+995500000082',
      expect.not.objectContaining({ referralCode: 'KC8FC24P' }),
    );
  });
});
