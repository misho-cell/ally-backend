const mockQuery = jest.fn();
jest.mock('../../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { holdersOf, withEveryHolder } from '../everyHolder';
import { oneRowPerBridge } from '../searchSecondDegree';

const ELECTRICIAN = '+995555000301';
const NIKA = { name: 'Nika', phone: '+995555000101', user_id: 101, saved_as: 'ელექტრიკოსი' };
const SALOME = { name: 'Salome', phone: '+995555000102', user_id: 102, saved_as: 'electrician' };

beforeEach(() => jest.resetAllMocks());

/** Tester 75991: two friends both hold the electrician; the plan must see both. */
describe('every friend who holds a found person is a route', () => {
  it('adds the friend whose label did not match the word, after the one that did', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { target: ELECTRICIAN, ...NIKA },
        { target: ELECTRICIAN, ...SALOME },
      ],
    });
    const [row] = await withEveryHolder(
      '7',
      [NIKA.phone, SALOME.phone],
      [{ phone: ELECTRICIAN, via_contacts: [NIKA] }],
    );
    expect(oneRowPerBridge(row.via_contacts ?? []).map((b) => b.name)).toEqual(['Nika', 'Salome']);
    const [sql, params, timeout] = mockQuery.mock.calls[0] as [string, unknown[], number];
    expect(sql).toContain('ua.phone = ANY($3::text[]) AND up.phone = ANY($2::text[])');
    expect(params).toEqual(['7', [NIKA.phone, SALOME.phone], [ELECTRICIAN], expect.any(Number)]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('keeps the rows as they were when the read fails', async () => {
    mockQuery.mockRejectedValue(new Error('timeout'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const rows = [{ phone: ELECTRICIAN, via_contacts: [NIKA] }];
    expect(await withEveryHolder('7', [NIKA.phone], rows)).toEqual(rows);
  });

  it('reads nothing with no friends or no rows', async () => {
    expect((await holdersOf('7', [], [ELECTRICIAN])).size).toBe(0);
    expect((await holdersOf('7', [NIKA.phone], [])).size).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('runs inside the second-degree search, on the found page', () => {
    const code = readFileSync(join(__dirname, '..', 'searchSecondDegree.ts'), 'utf8');
    expect(code).toContain('const rows = await withEveryHolder(userId, friendPhones, found);');
  });
});
