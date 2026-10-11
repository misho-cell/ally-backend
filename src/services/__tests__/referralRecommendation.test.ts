jest.mock('../instructedAsk', () => ({ __esModule: true, phoneForWords: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { phoneForWords } from '../instructedAsk';
import { recommendedContact, recommendsSomebody, refersSomebody } from '../referralRecommendation';

/** 3731 (IN-025, 2 of 2): the helper recommended her own contact, and that person heard nothing. */
const mockPhone = phoneForWords as jest.MockedFunction<typeof phoneForWords>;
const LINE = 'შემიძლია დაგაკავშირო. თამუნა მოგონილი ნოტარიუსია, ჩემი სახელით დაუკავშირდი.';
const TAMUNA = '995500000001';

beforeEach(() => mockPhone.mockReset());

describe('recommendsSomebody', () => {
  it('reads a recommendation to get in touch, in Georgian and English', () => {
    expect(recommendsSomebody(LINE)).toBe(true);
    expect(recommendsSomebody('ნინოს მიწერე, ის გეტყვის')).toBe(true);
    expect(recommendsSomebody('Talk to Nino, she knows')).toBe(true);
  });

  it('is not a plain answer', () => {
    expect(recommendsSomebody('არ ვიცი, ბოდიში')).toBe(false);
    expect(recommendsSomebody('ვიცნობ ერთ ნოტარიუსს')).toBe(false);
  });
});

describe('recommendedContact', () => {
  it('finds the one contact the line names, starting where her name starts', async () => {
    mockPhone.mockImplementation(async (_user, words) => (words[0] === 'თამუნა' ? TAMUNA : null));
    await expect(recommendedContact('7', LINE)).resolves.toEqual({
      phone: TAMUNA,
      typed: 'თამუნა',
    });
    // „ჩემი", „სახელით", „შემიძლია" and the verbs are never tried as a name.
    const firstWords = mockPhone.mock.calls.map(([, words]) => words[0]);
    expect(firstWords).not.toContain('ჩემი');
    expect(firstWords).not.toContain('სახელით');
    expect(firstWords).not.toContain('შემიძლია');
    expect(firstWords).not.toContain('დაუკავშირდი');
  });

  it('is null when two different people are named, or nobody', async () => {
    mockPhone.mockImplementation(async (_user, words) =>
      words[0] === 'თამუნა' ? TAMUNA : words[0] === 'ნოტარიუსია' ? '995500000002' : null,
    );
    await expect(recommendedContact('7', LINE)).resolves.toBeNull();
    mockPhone.mockResolvedValue(null);
    await expect(recommendedContact('7', LINE)).resolves.toBeNull();
  });

  it('reads nothing for a line that recommends nobody', async () => {
    await expect(recommendedContact('7', 'არ ვიცი')).resolves.toBeNull();
    expect(mockPhone).not.toHaveBeenCalled();
  });

  it('feeds the 1696 card, falling back to the recommendation when the order names nobody', () => {
    const service = readFileSync(join(__dirname, '..', 'askReferral.service.ts'), 'utf8');
    expect(service).toContain('if (sentence === null && !recommendsSomebody(line)) return null;');
    expect(service).toContain(
      "if (phone !== null) return { phone, typed: instructionAddressee(instruction) ?? '' };",
    );
    expect(service).toContain('return recommendedContact(recipientId, line);');
  });
});

/** 3731 (box 52112, 0 of 2): the recommended person was asked before the helper's tap. */
describe('refersSomebody — no relay before the tap', () => {
  const BOX_LINE = 'კი, თამუნა მოგონილი ნოტარიუსია, ჩემი სახელით დაუკავშირდი.';

  it('is the tester line, an order to ask, and a recommendation', () => {
    expect(refersSomebody(BOX_LINE)).toBe(true);
    expect(refersSomebody('ჰკითხე ეკას, ის გეტყვის')).toBe(true);
    expect(refersSomebody('ნინოს მიწერე')).toBe(true);
  });

  it('is not a plain answer', () => {
    expect(refersSomebody('კი, ვიცნობ, ხვალ დაგირეკავს')).toBe(false);
    expect(refersSomebody('არ ვიცი')).toBe(false);
  });

  it('takes relay_ask away from the reader run on such a line, so only the card relays', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      "const relayHeld = ownerAbsent || thread.type !== 'incoming_ask' || !refersSomebody(userMessage);",
    );
    expect(chat).toContain('(relayHeld || tool.name !== RELAY_ASK_TOOL.name),');
  });
});
