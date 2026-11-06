jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { addOwnersPersonToPlan, OWNERS_WORD_ROUTE } from '../taskPlans.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * Misho, 6 Nov (his student search): „ქეთის მიწერე" was refused as outside the
 * plan, and the run asked for permission to add her first. The owner's own
 * instruction is the yes, and it adds the person to the plan.
 */
describe('a person the owner told the run to write to', () => {
  beforeEach(() => mockQuery.mockReset());

  it('joins the plan once, under the owner’s word', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
    await addOwnersPersonToPlan(7, 'ქეთი', '+995555000111');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("jsonb_set(plan, '{people_to_involve}'");
    expect(sql).toContain('NOT EXISTS');
    expect(JSON.parse(String(params[1]))).toEqual({
      name: 'ქეთი',
      phone: '+995555000111',
      route: OWNERS_WORD_ROUTE,
    });
  });

  it('never stops the ask when the plan cannot be written', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(addOwnersPersonToPlan(7, 'ქეთი', '+995555000111')).resolves.toBeUndefined();
  });

  it('passes the plan wall in the owner’s own turn, and only there', () => {
    const src = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(src).toContain(
      'if (!verdict.allowed && parentAskId === undefined && ownerAskedNow === true) {',
    );
    const never = src.indexOf("verdict.reason === 'never_contact'");
    const owners = src.indexOf('ownerAskedNow === true) {\n    await addOwnersPersonToPlan(');
    expect(never).toBeGreaterThan(-1);
    expect(owners).toBeGreaterThan(never);
  });
});
