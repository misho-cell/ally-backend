jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { appBuildOf, appBuildsInUse, recordDevice } from '../deviceFingerprint.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => mockQuery.mockReset());

/** 4298 (plate NEW-7): which app build people keep using. */
describe('the app build', () => {
  it('is taken from X-App-Build only when it looks like a build code', () => {
    expect(appBuildOf(' 1953859 ')).toBe('1953859');
    expect(appBuildOf('v2.4.1-rc_1')).toBe('v2.4.1-rc_1');
    expect(appBuildOf(undefined)).toBeNull();
    expect(appBuildOf("1'; DROP TABLE x")).toBeNull();
    expect(appBuildOf('x'.repeat(41))).toBeNull();
  });

  it('is kept beside the device, and an absent header never wipes a known one', async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);
    await recordDevice('171', 'd-abc', 'UA', '1.2.3.4', '1953859');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('COALESCE(EXCLUDED.app_build, device_fingerprints.app_build)');
    expect(params).toEqual(['171', 'd-abc', 'UA', '1.2.3.4', '1953859']);
  });

  it('is reported per build over the last seven days, people and devices', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ app_build: '1953859', people: 12, devices: 15 }],
    } as never);
    await expect(appBuildsInUse()).resolves.toEqual([
      { app_build: '1953859', people: 12, devices: 15 },
    ]);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('GROUP BY app_build');
    expect(params?.[0]).toBe(7);
  });

  it('is read by the fingerprint middleware and served at GET /admin/app-builds', () => {
    const mw = readFileSync(
      join(__dirname, '..', '..', 'api', 'middleware', 'deviceFingerprint.middleware.ts'),
      'utf8',
    );
    expect(mw).toContain("appBuildOf(req.headers['x-app-build'])");
    const admin = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    expect(admin).toContain("adminRouter.get('/app-builds'");
  });
});
