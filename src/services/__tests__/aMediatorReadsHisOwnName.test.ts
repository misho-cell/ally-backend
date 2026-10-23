/**
 * The tester's 995 #5: an English mediator read „introduce them to სანდრო" —
 * the asker's label. His side of the request uses his own name for the person.
 */
jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../tools/nameMatch', () => ({ __esModule: true, findContactPhonesByName: jest.fn() }));

import { query } from '../../db/postgres/client';
import { targetNameForMediator } from '../mediatorTargetName';
import { findContactPhonesByName } from '../tools/nameMatch';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockMatches = findContactPhonesByName as jest.MockedFunction<typeof findContactPhonesByName>;

function rows(...list: object[]): never {
  return { rows: list } as never;
}

beforeEach(() => {
  mockQuery.mockReset();
  mockMatches.mockReset();
});

describe('targetNameForMediator', () => {
  it('uses his label for the number on the request', async () => {
    mockQuery.mockResolvedValueOnce(rows({ alias: 'Sandro Beridze' }));

    expect(await targetNameForMediator(551, 'სანდრო', '+995 599')).toBe('Sandro Beridze');
    expect(mockMatches).not.toHaveBeenCalled();
  });

  it('finds the number by the asker’s name when it is exactly one of his contacts', async () => {
    mockMatches.mockResolvedValueOnce(['p1']);
    mockQuery.mockResolvedValueOnce(rows({ alias: 'Sandro Beridze' }));

    expect(await targetNameForMediator(551, 'სანდრო', null)).toBe('Sandro Beridze');
    expect(mockQuery.mock.calls[0][1]).toEqual([551, 'p1']);
  });

  /**
   * 3895 (the tester's 58347, 0 of 3): Levan saved the target as „ბექუნა
   * ფოტოგრაფი"; the owner typed the target's registered name. His card reads
   * his own label, not the registered name and not the owner's words.
   */
  it('finds his contact by the name the person registered under, and reads his own label', async () => {
    mockMatches.mockResolvedValueOnce([]);
    mockQuery
      .mockResolvedValueOnce(rows({ phone: '+995500000123' }))
      .mockResolvedValueOnce(rows({ alias: 'ბექუნა ფოტოგრაფი' }));

    expect(await targetNameForMediator(551, 'ბექა მაისურაძე', null)).toBe('ბექუნა ფოტოგრაფი');
    expect(String(mockQuery.mock.calls[0][0])).toContain('LOWER(TRIM(u.name)) = LOWER(TRIM($2))');
    expect(String(mockQuery.mock.calls[1][0])).not.toContain('u.name');
  });

  it('keeps the asker’s name on none or two matches', async () => {
    mockMatches.mockResolvedValueOnce([]);
    mockQuery.mockResolvedValueOnce(rows());
    expect(await targetNameForMediator(551, 'სანდრო', null)).toBe('სანდრო');

    mockMatches.mockResolvedValueOnce(['p1', 'p2']);
    mockQuery.mockResolvedValueOnce(rows({ phone: 'a' }, { phone: 'b' }));
    expect(await targetNameForMediator(551, 'სანდრო', null)).toBe('სანდრო');
  });

  it('keeps the asker’s name when he has no label and nobody registered the number', async () => {
    mockQuery.mockResolvedValueOnce(rows()).mockResolvedValueOnce(rows());

    expect(await targetNameForMediator(551, 'სანდრო', '+995 599')).toBe('სანდრო');
  });

  /** #6601 / #6602 (Giorgi, 20 Oct): „იცნობ თუ არა ჩემს" — the asker's word for the target. */
  it('reads the registered name, not the asker’s label, when he has none of his own', async () => {
    mockQuery.mockResolvedValueOnce(rows()).mockResolvedValueOnce(rows({ name: 'გია ახალაძე' }));

    expect(await targetNameForMediator(551, 'chemi', '+995 599')).toBe('გია ახალაძე');
    expect(String(mockQuery.mock.calls[1][0])).toContain('u.name');
  });

  it('keeps the asker’s name when the read fails', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout'));

    expect(await targetNameForMediator(551, 'სანდრო', '+995 599')).toBe('სანდრო');
  });
});

/**
 * 3895 (IN-023, 2 of 2): the helper's card said „ბახვა გამოგონილს" for the man she
 * saved as „Baxva Gamogonili". findContactPhonesByName returns bare digits and
 * nameInBridgeBook compared them with the stored „+…" form, so it never matched.
 */
describe('nameInBridgeBook, read for the number in either form', () => {
  it('compares the numbers as digits', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join } = require('path') as typeof import('path');
    const src = readFileSync(join(__dirname, '..', 'bridgePicker.ts'), 'utf8');
    const fn = src.slice(src.indexOf('export async function nameInBridgeBook'));
    expect(fn.slice(0, 1200)).toContain(
      "AND regexp_replace(ua.phone, '\\\\D', '', 'g') = regexp_replace($2, '\\\\D', '', 'g')",
    );
    expect(fn.slice(0, 1200)).not.toContain('AND ua.phone = $2');
  });
});
