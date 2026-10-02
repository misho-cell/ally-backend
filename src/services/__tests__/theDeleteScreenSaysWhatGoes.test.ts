jest.mock('../../db/postgres/client', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  withTransaction: jest.fn(),
  __esModule: true,
}));
jest.mock('../../db/neo4j/client', () => ({
  __esModule: true,
  getSession: () => ({
    run: jest.fn().mockResolvedValue({ records: [] }),
    close: jest.fn().mockResolvedValue(undefined),
  }),
}));

import { withTransaction } from '../../db/postgres/client';
import { deleteMyAccount } from '../privacyRights.service';

/**
 * #506 (Ninia): the screen before „delete my account" says what is deleted.
 * The dry run — which changes nothing — carries that list in plain words, next
 * to what is kept and why.
 */
describe('the preview of an account deletion', () => {
  it('lists what goes and what stays, and touches nothing', async () => {
    const report = await deleteMyAccount('165699', true);

    expect(report.dryRun).toBe(true);
    expect(report.deletes.length).toBeGreaterThan(0);
    expect(report.deletes.join(' ')).toMatch(/contacts/);
    expect(report.deletes.join(' ')).toMatch(/subscription/);
    expect(report.retained.join(' ')).toMatch(/financial records/);
    expect(withTransaction).not.toHaveBeenCalled();
  });
});
