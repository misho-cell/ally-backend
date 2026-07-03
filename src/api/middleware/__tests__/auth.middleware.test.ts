jest.mock('../../../services/auth.service', () => ({ verifyToken: jest.fn(), __esModule: true }));

import { Request, Response } from 'express';
import { requireAdminRole, requireUserRole, AuthenticatedRequest } from '../auth.middleware';

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
