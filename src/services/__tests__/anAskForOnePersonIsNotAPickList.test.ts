/**
 * #1453 (Tornike, Pr1): Giorgi asked for an introduction to ONE named person,
 * whom Lika has saved in Latin letters. Lika was told she was asked because of
 * a same-surname contact, the wanted one third, and „whom would you recommend".
 */
jest.mock('../../db/postgres/client', () => ({
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  query: jest.fn(),
  __esModule: true,
}));
jest.mock('../tools/searchByTag', () => ({ __esModule: true, ownMatchesFor: jest.fn() }));

import { ownMatchesFor } from '../tools/searchByTag';
import { bridgePicker, isTheNamedPerson } from '../bridgePicker';

const mockMatches = ownMatchesFor as jest.MockedFunction<typeof ownMatchesFor>;

beforeEach(() => mockMatches.mockReset());

describe('an ask about one named person', () => {
  it('knows the person across scripts and spelling drift', () => {
    expect(isTheNamedPerson('ნინუცა წერეთელი', 'Ninuca Tsereteli')).toBe(true);
    expect(isTheNamedPerson('თამარ ჭავჭავაძე', 'Tamar Chavchavadze (work)')).toBe(true);
    expect(isTheNamedPerson('ნინუცა წერეთელი', 'Giorgi Tsereteli')).toBe(false);
    // One word is a need or a first name, never one identified person.
    expect(isTheNamedPerson('იურისტი', 'Iurist Iuristi')).toBe(false);
  });

  it('gets no pick-list when the reader has that person saved', async () => {
    mockMatches.mockResolvedValueOnce([
      { phone: 'p1', name: 'Giorgi Tsereteli' },
      { phone: 'p2', name: 'Ana Tsereteli' },
      { phone: 'p3', name: 'Ninuca Tsereteli' },
    ]);
    await expect(
      bridgePicker('551', { need: 'ნინუცა წერეთელი', forPhone: 'p1' }, 'ka'),
    ).resolves.toBeNull();
  });
});
