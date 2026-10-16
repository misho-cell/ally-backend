jest.mock('../../db/postgres/client', () => ({
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  query: jest.fn(),
  __esModule: true,
}));
jest.mock('../tools/searchByTag', () => ({ __esModule: true, ownMatchesFor: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { ownMatchesFor } from '../tools/searchByTag';
import { bridgePicker } from '../bridgePicker';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockMatches = ownMatchesFor as jest.MockedFunction<typeof ownMatchesFor>;

const NINO = { phone: 'p-nino', name: 'Nino Kapanadze' };
const DATO = { phone: 'p-dato', name: 'Dato Lomidze' };
const ILIA = { phone: 'p-ilia', name: 'Ilia Beridze' };

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [] } as never);
  mockMatches.mockReset();
});

/** 5418 (Giorgi, G-060 / G-061): the helper hears the true reason, and a hint that fits the count. */
describe('a helper is told only the true reason', () => {
  it('without a search behind the ask, gives no reason, only her fitting people', async () => {
    mockMatches.mockResolvedValueOnce([NINO, DATO]);

    const picker = await bridgePicker('551', { need: 'იურისტი' }, 'ka');

    expect(picker?.line).not.toContain('იმიტომ გკითხეს');
    expect(picker?.names).toEqual(['Nino Kapanadze', 'Dato Lomidze']);
  });

  it('says „both" under exactly two names', async () => {
    mockMatches.mockResolvedValueOnce([NINO, DATO]);
    const picker = await bridgePicker('551', { need: 'იურისტი' }, 'ka');
    expect(picker?.line).toContain('„ორივე"');
  });

  it('under three names asks for their names, never „both"', async () => {
    mockMatches.mockResolvedValueOnce([NINO, DATO, ILIA]);
    const picker = await bridgePicker('551', { need: 'იურისტი' }, 'ka');
    expect(picker?.line).not.toContain('ორივე');
    expect(picker?.line).toContain('დაწერე მათი სახელები.');
  });

  it('drops the search reason when the owner named the helper himself', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).toContain(
      'ownerNamedHelper && searchedNeed !== undefined ? { need: searchedNeed.need }',
    );
    expect(asks).toContain('fromOwnersLine === true ||');
  });
});
