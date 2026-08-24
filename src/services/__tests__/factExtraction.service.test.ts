jest.mock('../contactFacts.service', () => ({
  __esModule: true,
  submitContactFact: jest.fn().mockResolvedValue({ is_public: false, canonical_value: null }),
  FACT_FIELD_TYPES: ['occupation', 'employer', 'city', 'industry'],
}));
jest.mock('../tools/nameMatch', () => ({
  __esModule: true,
  findContactPhonesByName: jest.fn(),
}));
jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordClaudeUsage: jest.fn().mockResolvedValue(undefined),
}));

const mockCreate = jest.fn();
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: (...args: unknown[]) => mockCreate(...args) } },
}));

import { submitContactFact } from '../contactFacts.service';
import { findContactPhonesByName } from '../tools/nameMatch';
import { sweepFactsFromExchange } from '../factExtraction.service';

const mockSubmitFact = submitContactFact as jest.MockedFunction<typeof submitContactFact>;
const mockFindPhones = findContactPhonesByName as jest.MockedFunction<
  typeof findContactPhonesByName
>;

function anthropicTextResponse(text: string): {
  content: { type: string; text: string }[];
  usage: object;
} {
  return { content: [{ type: 'text', text }], usage: {} };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('sweepFactsFromExchange (engine T1)', () => {
  it('skips the model call entirely for a very short message', async () => {
    await sweepFactsFromExchange('7', 42, 'კი', 'კარგი');

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("writes a fact tagged source='sweep' when the named person resolves to exactly one contact", async () => {
    mockCreate.mockResolvedValue(
      anthropicTextResponse(
        JSON.stringify([
          { person_name: 'სალომე', field_type: 'occupation', value: 'ექიმი', confidence: 'stated' },
        ]),
      ),
    );
    mockFindPhones.mockResolvedValue(['995599111222']);

    await sweepFactsFromExchange('7', 42, 'სალომე ექიმია პირველ საავადმყოფოში', 'გასაგებია');

    expect(mockSubmitFact).toHaveBeenCalledWith(
      '7',
      '995599111222',
      'occupation',
      'ექიმი',
      'sweep',
      'stated',
    );
  });

  it('never writes when the name matches zero or multiple contacts — no guessing', async () => {
    mockCreate.mockResolvedValue(
      anthropicTextResponse(
        JSON.stringify([
          { person_name: 'გია', field_type: 'occupation', value: 'ტაქსისტი', confidence: 'stated' },
        ]),
      ),
    );
    mockFindPhones.mockResolvedValue(['1', '2']);

    await sweepFactsFromExchange('7', 42, 'გია ტაქსისტად მუშაობს ახლა', 'გასაგებია');

    expect(mockSubmitFact).not.toHaveBeenCalled();
  });

  it('drops a candidate with a field_type outside the allowed vocabulary', async () => {
    mockCreate.mockResolvedValue(
      anthropicTextResponse(
        JSON.stringify([
          { person_name: 'გია', field_type: 'zodiac_sign', value: 'Leo', confidence: 'stated' },
        ]),
      ),
    );

    await sweepFactsFromExchange('7', 42, 'გია ლომის ნიშნითაა დაბადებული', 'გასაგებია');

    expect(mockFindPhones).not.toHaveBeenCalled();
    expect(mockSubmitFact).not.toHaveBeenCalled();
  });

  it('never throws when the model reply is not valid JSON', async () => {
    mockCreate.mockResolvedValue(anthropicTextResponse('I cannot help with that.'));

    await expect(
      sweepFactsFromExchange('7', 42, 'ეს საკმარისად გრძელი შეტყობინებაა', 'პასუხი'),
    ).resolves.toBeUndefined();
    expect(mockSubmitFact).not.toHaveBeenCalled();
  });

  it('never throws when the model call itself fails', async () => {
    mockCreate.mockRejectedValue(new Error('rate limited'));

    await expect(
      sweepFactsFromExchange('7', 42, 'ეს საკმარისად გრძელი შეტყობინებაა', 'პასუხი'),
    ).resolves.toBeUndefined();
  });
});
