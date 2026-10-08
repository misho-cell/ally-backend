/**
 * Plate v301 G4: Giorgi was told the mediator knows a lawyer, and the mediator
 * was asked only „do you know an experienced lawyer?". DONE WHEN: the request
 * names the person, offers other fitting contacts of the mediator and
 * „other", and asks whom he recommends.
 */
jest.mock('../../db/postgres/client', () => ({
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  query: jest.fn(),
  __esModule: true,
}));
jest.mock('../tools/searchByTag', () => ({ __esModule: true, ownMatchesFor: jest.fn() }));

import { query } from '../../db/postgres/client';
import { ownMatchesFor } from '../tools/searchByTag';
import { bridgePicker } from '../bridgePicker';
import { declineChoice, laterChoice } from '../askOpening';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockMatches = ownMatchesFor as jest.MockedFunction<typeof ownMatchesFor>;

const BRIDGE = '551';
const ILIA = { phone: 'p-ilia', name: 'Ilia Beridze' };
const NINO = { phone: 'p-nino', name: 'Nino Kapanadze' };
const DATO = { phone: 'p-dato', name: 'Dato Lomidze' };

function bookName(name: string | null): void {
  mockQuery.mockResolvedValueOnce({ rows: name ? [{ name }] : [] } as never);
}

beforeEach(() => {
  mockQuery.mockReset();
  // 2907: what the mediator saved about the people shown — nothing, unless a test says so.
  mockQuery.mockResolvedValue({ rows: [] } as never);
  mockMatches.mockReset();
});

describe('a mediator asked on behalf of a need', () => {
  it('is told whom he was picked for, first, then the others, then „other"', async () => {
    mockMatches.mockResolvedValueOnce([NINO, ILIA, DATO]);

    const picker = await bridgePicker(BRIDGE, { need: 'იურისტი', forPhone: ILIA.phone }, 'ka');

    expect(picker?.line).toContain('შენს კონტაქტებშია Ilia Beridze');
    expect(picker?.line).toContain('Nino Kapanadze, Dato Lomidze');
    // #2185: one question per message — the line no longer asks a second one.
    expect(picker?.line).not.toContain('ვის ურჩევდი?');
    expect(picker?.choices).toEqual([
      'Ilia Beridze',
      'Nino Kapanadze',
      'Dato Lomidze',
      'სხვას ვურჩევდი',
      declineChoice('ka'),
      laterChoice('ka'),
    ]);
  });

  it('names the picked person from his own phonebook when the need words missed him', async () => {
    mockMatches.mockResolvedValueOnce([NINO]);
    bookName('Ilia Beridze');

    const picker = await bridgePicker(BRIDGE, { need: 'lawyer', forPhone: ILIA.phone }, 'en');

    expect(picker?.line).toBe(
      'You were asked because Ilia Beridze is in your contacts. Others who may fit: Nino Kapanadze.',
    );
    expect(mockQuery.mock.calls[0]?.[1]).toEqual([BRIDGE, ILIA.phone]);
  });

  it('offers his fitting contacts when nobody in particular was found through him', async () => {
    mockMatches.mockResolvedValueOnce([NINO, DATO]);

    const picker = await bridgePicker(BRIDGE, { need: 'lawyer' }, 'en');

    expect(picker?.line).toBe('In your contacts, these may fit: Nino Kapanadze, Dato Lomidze.');
    expect(picker?.choices.slice(0, 3)).toEqual(['Nino Kapanadze', 'Dato Lomidze', 'Someone else']);
  });

  it('keeps the ordinary buttons when he has nobody fitting', async () => {
    mockMatches.mockResolvedValueOnce([]);
    bookName(null);

    expect(await bridgePicker(BRIDGE, { need: 'lawyer', forPhone: 'p-x' }, 'en')).toBeNull();
  });

  it('never shows a number a label carried', async () => {
    mockMatches.mockResolvedValueOnce([{ phone: 'p-1', name: 'Gia +995 599 123 456' }]);

    const picker = await bridgePicker(BRIDGE, { need: 'lawyer' }, 'en');

    expect(picker?.line).not.toContain('599 123 456');
  });

  it('lists one person once', async () => {
    mockMatches.mockResolvedValueOnce([ILIA, { phone: 'p-ilia-2', name: 'Ilia Beridze' }]);

    const picker = await bridgePicker(BRIDGE, { need: 'lawyer', forPhone: ILIA.phone }, 'en');

    expect(picker?.choices.filter((c) => c === 'Ilia Beridze')).toHaveLength(1);
  });
});
