const mockClientQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  withTransaction: (cb: (c: unknown) => Promise<unknown>) => cb({ query: mockClientQuery }),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { removeImportedLabels } from '../labelRemoval.service';

beforeEach(() => jest.resetAllMocks());

/** #7761: „chemi" on Turashvili, a card the founder never saved. */
describe('a label the owner never saved', () => {
  it('removes only the given rows, and only the owner’s own', async () => {
    mockClientQuery.mockResolvedValue({ rowCount: 1 });
    expect(await removeImportedLabels(501, [11], [22])).toEqual({
      aliases_removed: 1,
      tags_removed: 1,
    });
    const deletes = mockClientQuery.mock.calls.filter(([sql]) =>
      String(sql).startsWith('DELETE'),
    ) as [string, unknown[]][];
    expect(deletes[0]?.[0]).toContain('"UserAlias" WHERE "contactId" = $1 AND id = ANY');
    expect(deletes[0]?.[1]).toEqual([501, [11]]);
    expect(deletes[1]?.[0]).toContain('"UserTags" WHERE "contactId" = $1 AND id = ANY');
    expect(deletes[1]?.[1]).toEqual([501, [22]]);
  });

  it('touches nothing when no ids are given', async () => {
    expect(await removeImportedLabels(501, [], [])).toEqual({
      aliases_removed: 0,
      tags_removed: 0,
    });
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it('is reachable from the admin routes, behind confirm', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    expect(routes).toContain("'/users/:id/labels/remove'");
    expect(routes).toMatch(/labels\/remove[\s\S]{0,900}body\.confirm !== true/u);
  });
});
