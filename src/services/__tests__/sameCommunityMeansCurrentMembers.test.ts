const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));
const mockAdd = jest.fn();
const mockRemove = jest.fn();
jest.mock('../roster.service', () => ({
  addRosterMember: (...a: unknown[]) => mockAdd(...a),
  removeRosterMember: (...a: unknown[]) => mockRemove(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { MembershipStatus, membershipRows } from '../basePeople/membershipList';
import { applyMembershipList, phoneForRow } from '../basePeople/membershipList.service';

/**
 * #7758 (the founder's word; Misho's yes, 29 Oct): „same community" is the
 * community's CURRENT members only, from the community's own list.
 */
const CSV =
  'person_key,name,community,status,date\n' +
  'AX-001,,Axel,current,2026-10-04\n' +
  'AX-002,,Axel,former,2026-10-08\n' +
  ',Zaza Gamogonili,Axel,current,2026-10-04\n' +
  'AX-404,,Axel,current,2026-10-04\n' +
  'AX-005,,Other Club,current,2026-10-04\n' +
  'AX-006,,Axel,invited,2026-10-04\n';
const PEOPLE = {
  rows: [
    { person_key: 'AX-001', name: 'Nino One', phone: '+995500000301' },
    { person_key: 'AX-002', name: 'Giorgi Two', phone: '+995500000302' },
    { person_key: 'CV-9', name: 'Zaza Gamogonili', phone: '+995500000303' },
  ],
};

beforeEach(() => {
  jest.resetAllMocks();
  mockAdd.mockResolvedValue({ changed: true });
  mockRemove.mockResolvedValue({ changed: true });
});

describe('a community’s current/former list', () => {
  it('reads one community; another community or an unknown status is counted, not loaded', () => {
    const { rows, skipped } = membershipRows(CSV, 'Axel');
    expect(rows.map((r) => r.status)).toEqual([
      MembershipStatus.Current,
      MembershipStatus.Former,
      MembershipStatus.Current,
      MembershipStatus.Current,
    ]);
    expect(skipped).toEqual({ other_community: 1, no_status: 1 });
  });

  it('finds a person by key, else by a name one person alone carries', () => {
    const { rows } = membershipRows(CSV, 'Axel');
    expect(phoneForRow(rows[2], PEOPLE.rows)).toBe('+995500000303');
    expect(phoneForRow(rows[3], PEOPLE.rows)).toBeNull();
  });

  it('a dry run counts and writes nothing', async () => {
    mockQuery.mockResolvedValueOnce(PEOPLE);
    const report = await applyMembershipList('Axel', CSV, true, '7');
    expect(report).toMatchObject({ current: 3, former: 1, not_found: 1, changed: 0 });
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('a current member is on the roster; a former one is taken off it and marked former', async () => {
    mockQuery.mockResolvedValueOnce(PEOPLE);
    const report = await applyMembershipList('Axel', CSV, false, '7');
    expect(report.changed).toBe(3);
    expect(mockRemove).toHaveBeenCalledWith('Axel', '+995500000302');
    expect(mockAdd).toHaveBeenCalledWith('Axel', '+995500000302', '7', { former: true });
    expect(mockAdd).toHaveBeenCalledWith('Axel', '+995500000301', '7');
  });

  it('has an admin route that requires dry_run', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    const route = routes.slice(routes.indexOf("'/roster/:group/membership-list'"));
    expect(route).toContain("typeof body.dry_run !== 'boolean'");
  });
});
