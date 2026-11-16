jest.mock('../tools/searchByTag', () => ({ __esModule: true, exactMatchesForMany: jest.fn() }));
jest.mock('../toolCallLog.service', () => ({
  __esModule: true,
  logToolCall: jest.fn().mockResolvedValue(undefined),
}));

import { findWaysIn, firmInTheOtherScript } from '../openingSearch.service';
import { exactMatchesForMany } from '../tools/searchByTag';

/**
 * Ops, 16 Nov 15:45Z (a real member's thermos goal): the web named the firm
 * „ბრენდჰენდი"; members had saved its head with the tag „brendhendi". The way-in
 * lookup read only the web's spelling and said nobody was there.
 */
const mockTag = exactMatchesForMany as jest.MockedFunction<typeof exactMatchesForMany>;
const HEAD = { name: 'Levan Japaridze', phone: '995500000003' };

beforeEach(() => jest.clearAllMocks());

describe('a firm found on the web', () => {
  it('is looked for in the other alphabet too, as people save it', async () => {
    mockTag.mockImplementation(
      async (_user, queries) => new Map(queries.map((q) => [q, q === 'brendhendi' ? HEAD : null])),
    );
    const waysIn = await findWaysIn('501', ['ბრენდჰენდი'], { threadId: 7 });

    expect(mockTag.mock.calls[0][1]).toEqual(['ბრენდჰენდი', 'brendhendi']);
    expect(waysIn.get('ბრენდჰენდი')).toEqual({ kind: 'first_circle', who: HEAD.name });
  });

  it('is spelled in the other alphabet both ways, and not at all when nothing changes', () => {
    expect(firmInTheOtherScript('ბრენდჰენდი')).toBe('brendhendi');
    expect(firmInTheOtherScript('brendhendi')).toBe('ბრენდჰენდი');
    expect(firmInTheOtherScript('2024')).toBe('');
  });

  it('keeps a person’s stricter lookup: no other spelling for a name', async () => {
    mockTag.mockResolvedValue(new Map());
    await findWaysIn('501', ['Nino Beridze'], { threadId: 7 }, undefined, {
      everyNameIsAPerson: true,
    });
    expect(mockTag.mock.calls[0][1]).toHaveLength(1);
  });
});
