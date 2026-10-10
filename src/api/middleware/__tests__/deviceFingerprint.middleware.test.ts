jest.mock('../../../services/auth.service', () => ({ __esModule: true, verifyToken: jest.fn() }));
jest.mock('../../../services/deviceFingerprint.service', () => ({
  __esModule: true,
  ...jest.requireActual('../../../services/deviceFingerprint.service'),
  recordDevice: jest.fn(() => Promise.resolve()),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { Request, Response } from 'express';
import { verifyToken } from '../../../services/auth.service';
import { recordDevice } from '../../../services/deviceFingerprint.service';
import { captureDeviceFingerprint, dueForRecording } from '../deviceFingerprint.middleware';

const mockVerify = verifyToken as jest.MockedFunction<typeof verifyToken>;
const mockRecord = recordDevice as jest.MockedFunction<typeof recordDevice>;

function request(headers: Record<string, string>): Request {
  return { headers, ip: '10.0.0.1' } as unknown as Request;
}

/** 4298 (tester box 51104): a build sent on any route was not counted. */
describe('the device and build of a signed-in request', () => {
  beforeEach(() => {
    mockVerify.mockReset();
    mockRecord.mockClear();
  });

  it('is recorded with its build, and the request goes on', () => {
    mockVerify.mockReturnValue({ userId: '501', role: 'user' });
    const next = jest.fn();
    captureDeviceFingerprint(
      request({ authorization: 'Bearer t', 'x-device-id': 'dev-a', 'x-app-build': '1.2.3-test15' }),
      {} as Response,
      next,
    );
    expect(mockRecord).toHaveBeenCalledWith('501', 'dev-a', null, '10.0.0.1', '1.2.3-test15');
    expect(next).toHaveBeenCalled();
  });

  it('is written once a minute for the same build, at once for a new one', () => {
    mockVerify.mockReturnValue({ userId: '502', role: 'user' });
    const send = (build: string): void =>
      captureDeviceFingerprint(
        request({ authorization: 'Bearer t', 'x-device-id': 'dev-b', 'x-app-build': build }),
        {} as Response,
        jest.fn(),
      );
    send('1.0.0');
    send('1.0.0');
    send('1.0.1');
    expect(mockRecord.mock.calls.map((call) => call[4])).toEqual(['1.0.0', '1.0.1']);
  });

  it.each([
    ['no device id', { authorization: 'Bearer t' }],
    ['no token', { 'x-device-id': 'dev-c' }],
  ])('is not recorded with %s, and the request goes on', (_, headers) => {
    mockVerify.mockReturnValue({ userId: '503', role: 'user' });
    const next = jest.fn();
    captureDeviceFingerprint(request(headers), {} as Response, next);
    expect(mockRecord).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('is not recorded for an invalid token or an admin token', () => {
    mockVerify.mockImplementationOnce(() => {
      throw new Error('bad token');
    });
    mockVerify.mockReturnValueOnce({ userId: '1', role: 'admin' });
    for (let i = 0; i < 2; i += 1) {
      captureDeviceFingerprint(
        request({ authorization: 'Bearer t', 'x-device-id': `dev-d${i}` }),
        {} as Response,
        jest.fn(),
      );
    }
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('runs on every route, not on two routers', () => {
    const index = readFileSync(join(__dirname, '..', '..', '..', 'index.ts'), 'utf8');
    expect(index).toContain('app.use(captureDeviceFingerprint);');
    expect(index.indexOf('app.use(captureDeviceFingerprint);')).toBeLessThan(
      index.indexOf("app.use('/chat', chatRouter);"),
    );
  });
});

describe('the once-a-minute memory', () => {
  it('lets the same key through again after a minute', () => {
    expect(dueForRecording('k', 0)).toBe(true);
    expect(dueForRecording('k', 59_999)).toBe(false);
    expect(dueForRecording('k', 60_000)).toBe(true);
  });
});
