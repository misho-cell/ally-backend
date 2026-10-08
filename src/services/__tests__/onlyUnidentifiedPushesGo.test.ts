jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { deleteUnidentifiedPushSubscriptions } from '../notification.service';

/** §100 (Misho, 8 Oct): only a person's subscriptions with no device id and no user agent go. */
const mockQuery = query as jest.MockedFunction<typeof query>;
const admin = readFileSync(join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'), 'utf8');

describe('removing the unidentified push subscriptions', () => {
  it('touches one person, only rows with neither a device nor a user agent', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 3 } as never);

    expect(await deleteUnidentifiedPushSubscriptions('160584')).toBe(3);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('DELETE FROM push_subscriptions');
    expect(sql).toContain('WHERE user_id = $1');
    expect(sql).toContain("NULLIF(TRIM(COALESCE(user_agent, '')), '') IS NULL");
    expect(sql).toContain("NULLIF(TRIM(COALESCE(device_id, '')), '') IS NULL");
    expect(params).toEqual(['160584']);
  });

  it('the admin route takes a numeric id only, and says how many went', () => {
    const route = admin.slice(
      admin.indexOf("adminRouter.delete('/users/:userId/push/unidentified'"),
    );
    expect(route.slice(0, 900)).toContain('/^\\d+$/.test(userId)');
    expect(route.slice(0, 900)).toContain('data: { user_id: userId, removed }');
  });
});
