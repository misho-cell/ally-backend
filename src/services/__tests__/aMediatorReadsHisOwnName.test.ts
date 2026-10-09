/**
 * The tester's 995 #5: an English mediator read „introduce them to სანდრო" —
 * the asker's label. His side of the request uses his own name for the person.
 */
jest.mock('../bridgePicker', () => ({ __esModule: true, nameInBridgeBook: jest.fn() }));
jest.mock('../tools/nameMatch', () => ({ __esModule: true, findContactPhonesByName: jest.fn() }));

import { nameInBridgeBook } from '../bridgePicker';
import { targetNameForMediator } from '../mediatorTargetName';
import { findContactPhonesByName } from '../tools/nameMatch';

const mockName = nameInBridgeBook as jest.MockedFunction<typeof nameInBridgeBook>;
const mockMatches = findContactPhonesByName as jest.MockedFunction<typeof findContactPhonesByName>;

beforeEach(() => {
  mockName.mockReset();
  mockMatches.mockReset();
});

describe('targetNameForMediator', () => {
  it('uses his name for the number on the request', async () => {
    mockName.mockResolvedValueOnce('Sandro Beridze');

    expect(await targetNameForMediator(551, 'სანდრო', '+995 599')).toBe('Sandro Beridze');
    expect(mockMatches).not.toHaveBeenCalled();
  });

  it('finds the number by the asker’s name when it is exactly one of his contacts', async () => {
    mockMatches.mockResolvedValueOnce(['p1']);
    mockName.mockResolvedValueOnce('Sandro Beridze');

    expect(await targetNameForMediator(551, 'სანდრო', null)).toBe('Sandro Beridze');
    expect(mockName).toHaveBeenCalledWith('551', 'p1');
  });

  it('keeps the asker’s name on none or two matches', async () => {
    mockMatches.mockResolvedValueOnce([]);
    expect(await targetNameForMediator(551, 'სანდრო', null)).toBe('სანდრო');

    mockMatches.mockResolvedValueOnce(['p1', 'p2']);
    expect(await targetNameForMediator(551, 'სანდრო', null)).toBe('სანდრო');
  });

  it('keeps the asker’s name when the read fails', async () => {
    mockName.mockRejectedValueOnce(new Error('timeout'));

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
