const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { OwnerTieReason, ownerTiesTo } from '../ownerTies';
import { warmestFirst } from '../tools/searchSecondDegree';

/** #5479 (founder, 17 Oct; Misho's yes): warm routes, with one plain reason per go-between. */
describe('the owner’s tie to a go-between', () => {
  beforeEach(() => jest.resetAllMocks());

  const stored = (rows: unknown[]) => ({ rows });
  const warmth = (rows: unknown[]) => ({ rows });

  it('is what the owner said first, then family, then close, then help in Netai', async () => {
    mockQuery
      .mockResolvedValueOnce(
        stored([
          { phone: '+995500000001', strength: 0.4, kind: 'formal' },
          { phone: '+995500000002', strength: 0.9, kind: 'family' },
          { phone: '+995500000003', strength: 0.67, kind: 'close' },
          { phone: '+995500000004', strength: 0.4, kind: 'formal' },
          { phone: '+995500000005', strength: 0.4, kind: 'formal' },
        ]),
      )
      .mockResolvedValueOnce(
        warmth([
          { contact_phone: '+995500000001', total: '0.5', events: '1', kinds: ['stated_close'] },
          { contact_phone: '+995500000004', total: '0.2', events: '1', kinds: ['ask_answered'] },
        ]),
      )
      .mockResolvedValueOnce({ rows: [{ phone: '+995500000004' }] });
    const ties = await ownerTiesTo('501', [
      '+995500000001',
      '+995500000002',
      '+995500000003',
      '+995500000004',
      '+995500000005',
    ]);
    expect(ties.get('995500000001')).toEqual({ closeness: 0.9, reason: OwnerTieReason.SaidClose });
    expect(ties.get('995500000002')?.reason).toBe(OwnerTieReason.Family);
    expect(ties.get('995500000003')?.reason).toBe(OwnerTieReason.Close);
    expect(ties.get('995500000004')?.reason).toBe(OwnerTieReason.DealtWith);
    expect(ties.get('995500000005')).toEqual({ closeness: 0.4, reason: null });
  });

  it('puts the closest go-between first, keeping the order of equals', () => {
    const ties = new Map([['995500000002', { closeness: 0.9, reason: OwnerTieReason.Family }]]);
    const bridges = [
      { name: 'Ana', phone: '+995500000001' },
      { name: 'Nika', phone: '+995500000002' },
      { name: 'Beka', phone: '+995500000003' },
    ];
    expect(warmestFirst(bridges, ties).map((b) => b.name)).toEqual(['Nika', 'Ana', 'Beka']);
  });

  it('is carried on the warm path’s first bridge and on second-degree go-betweens', () => {
    const walk = readFileSync(join(__dirname, '..', 'tools', 'findWarmPath.ts'), 'utf8');
    expect(walk).toContain('owner_tie: reason');
    expect(walk).toContain('A first bridge with owner_tie is someone the owner is close to');
    const second = readFileSync(join(__dirname, '..', 'tools', 'searchSecondDegree.ts'), 'utf8');
    expect(second).toContain('owner_tie: tie');
    expect(second).toContain('warmestFirst(oneRowPerBridge(row.via_contacts ?? []), viaTies)');
  });
});
