jest.mock('../instructedAsk', () => ({ __esModule: true, phoneForWords: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { phoneForWords } from '../instructedAsk';
import { recommendedContact, recommendsSomebody } from '../referralRecommendation';

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

  it('feeds the 1696 card, which sends nothing before the reader taps', () => {
    const service = readFileSync(join(__dirname, '..', 'askReferral.service.ts'), 'utf8');
    expect(service).toContain('if (sentence === null && !recommendsSomebody(line)) return null;');
    expect(service).toContain('return recommendedContact(recipientId, line);');
  });
});
