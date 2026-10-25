const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...args: unknown[]) => mockQuery(...args),
  default: {},
}));
jest.mock('../connectorState.service', () => ({
  connectorState: jest.fn().mockResolvedValue({ connected: false }),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { SetupStep, setupMissingSince } from '../setupState.service';

beforeEach(() => mockQuery.mockReset());

/** #7723 / #7730 (tester's engagement desk C-0020, 25 Oct). */
describe('who joined and which setup steps each still lacks', () => {
  it('lists the missing steps, with what the gadget said, and counts each step done', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM "User" u')) {
        return Promise.resolve({ rows: [{ id: 7, name: 'ნინო', joined_at: '2026-10-21' }] });
      }
      if (sql.includes('import_attempts')) {
        return Promise.resolve({
          rows: [{ contacts: false, freshness: false, notifications: true, started_at: null }],
        });
      }
      return Promise.resolve({
        rows: [
          { device_id: 'd1', gadget: 'iphone', step: 'contacts', status: 'later', updated_at: 'x' },
          { device_id: 'd1', gadget: 'iphone', step: 'install', status: 'done', updated_at: 'x' },
        ],
      });
    });
    const report = await setupMissingSince('2026-10-21');
    expect(report.total_people).toBe(1);
    const missing = report.people[0].missing;
    expect(missing.map((m) => m.step)).toEqual([
      SetupStep.Contacts,
      SetupStep.Freshness,
      SetupStep.Connector,
    ]);
    expect(missing[0].said).toBe('later');
    expect(report.done_by_step.contacts).toBe(0);
    expect(report.done_by_step.notifications).toBe(1);
    expect(report.done_by_step.install).toBe(1);
    expect(String(mockQuery.mock.calls[0][0])).toContain('NOT EXISTS (SELECT 1 FROM test_seats');
  });

  it('are behind the admin login, the day checked', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    expect(routes).toContain("adminRouter.get('/setup-missing'");
    expect(routes).toContain("'/users/:id/setup'");
    expect(routes).toContain('since must be a day, YYYY-MM-DD');
  });
});
