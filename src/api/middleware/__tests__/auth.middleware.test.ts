jest.mock('../../../services/auth.service', () => ({ verifyToken: jest.fn(), __esModule: true }));

import { Request, Response } from 'express';
import { TokenExpiredError } from 'jsonwebtoken';
import {
  authenticateJwt,
  requireAdminRole,
  requireUserRole,
  AuthenticatedRequest,
} from '../auth.middleware';

function makeRes(): { res: Response; status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status } as unknown as Response, status, json };
}

function makeReq(role: 'user' | 'admin'): Request {
  const req = {} as AuthenticatedRequest;
  req.user = { userId: '7', role };
  return req as Request;
}

describe('requireUserRole', () => {
  it('passes user tokens through', () => {
    const { res } = makeRes();
    const next = jest.fn();

    requireUserRole(makeReq('user'), res, next);

    expect(next).toHaveBeenCalled();
  });

  it('rejects admin tokens with 403 and a machine reason', () => {
    const { res, status, json } = makeRes();
    const next = jest.fn();

    requireUserRole(makeReq('admin'), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, reason: 'admin_token_on_user_endpoint' }),
    );
  });
});

describe('requireAdminRole', () => {
  it('rejects user tokens with 403', () => {
    const { res, status } = makeRes();
    const next = jest.fn();

    requireAdminRole(makeReq('user'), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });
});

describe('a refused token leaves one line (4656)', () => {
  const { verifyToken } = jest.requireMock('../../../services/auth.service') as {
    verifyToken: jest.Mock;
  };
  const SECRET_LOOKING_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.e30.secret-part';

  function refusedReq(authorization?: string): Request {
    return {
      method: 'GET',
      baseUrl: '/chat',
      path: '/threads',
      headers: authorization === undefined ? {} : { authorization },
    } as unknown as Request;
  }

  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('names an expired token, its route and when it expired', () => {
    const expiredAt = new Date('2026-10-12T10:00:00.000Z');
    verifyToken.mockImplementation(() => {
      throw new TokenExpiredError('jwt expired', expiredAt);
    });
    const { res, status } = makeRes();
    authenticateJwt(refusedReq(`Bearer ${SECRET_LOOKING_TOKEN}`), res, jest.fn());
    expect(status).toHaveBeenCalledWith(401);
    expect(warn).toHaveBeenCalledWith(
      '[auth] 401 expired GET /chat/threads expired_at=2026-10-12T10:00:00.000Z',
    );
  });

  it('names a token that does not verify, and never prints the token', () => {
    verifyToken.mockImplementation(() => {
      throw new Error('invalid signature');
    });
    const { res } = makeRes();
    authenticateJwt(refusedReq(`Bearer ${SECRET_LOOKING_TOKEN}`), res, jest.fn());
    expect(warn).toHaveBeenCalledWith('[auth] 401 invalid GET /chat/threads');
    expect(String(warn.mock.calls[0][0])).not.toContain('secret-part');
  });

  it('names a missing header', () => {
    const { res } = makeRes();
    authenticateJwt(refusedReq(), res, jest.fn());
    expect(warn).toHaveBeenCalledWith('[auth] 401 missing_header GET /chat/threads');
  });

  it('logs nothing for a token that verifies', () => {
    verifyToken.mockReturnValue({ userId: '7', role: 'user' });
    const next = jest.fn();
    authenticateJwt(refusedReq('Bearer ok'), makeRes().res, next);
    expect(next).toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
