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
