// The sweep now reads what it has already stored on a contact before writing
// again (it used to keep eight copies of one fact), so this suite needs the
// client mocked — without it the read threw and every write was swallowed.
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}));
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
  it('skips the model call for a very short message that confirms nothing', async () => {
    await sweepFactsFromExchange('7', 42, 'აა', 'კარგი');

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('DOES read a short message when it is an agreement with a reply to agree to', async () => {
    // „კი" used to be skipped by length. But an agreement is short by nature,
    // and it is the one short message that carries a fact: it makes the
    // assistant's last sentence the user's own. Skipping it meant "what the
    // user confirmed" could never be stored.
    mockCreate.mockResolvedValue(anthropicTextResponse('[]'));

    await sweepFactsFromExchange('7', 42, 'კი', 'ნიკა ბათუმში ცხოვრობს?');

    expect(mockCreate).toHaveBeenCalled();
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

  it('strips a year the model invented that was never in the exchange — live-caught: told only "starting a construction project in Vake", no date, the model wrote "(2025)" anyway', async () => {
    mockCreate.mockResolvedValue(
      anthropicTextResponse(
        JSON.stringify([
          {
            person_name: 'ბესო',
            field_type: 'note',
            value: 'ვაკეში ახალ სამშენებლო პროექტს იწყებს (2025)',
            confidence: 'stated',
          },
        ]),
      ),
    );
    mockFindPhones.mockResolvedValue(['995599111222']);

    await sweepFactsFromExchange(
      '7',
      42,
      'ბესო ორთოიძე ვაკეში ახალ სამშენებლო პროექტს იწყებს',
      'გასაგებია',
    );

    expect(mockSubmitFact).toHaveBeenCalledWith(
      '7',
      '995599111222',
      'note',
      'ვაკეში ახალ სამშენებლო პროექტს იწყებს',
      'sweep',
      'stated',
    );
  });

  it('keeps a year that genuinely appears in the exchange', async () => {
    mockCreate.mockResolvedValue(
      anthropicTextResponse(
        JSON.stringify([
          {
            person_name: 'ბესო',
            field_type: 'note',
            value: 'პროექტს იწყებს 2027 წელს',
            confidence: 'stated',
          },
        ]),
      ),
    );
    mockFindPhones.mockResolvedValue(['995599111222']);

    await sweepFactsFromExchange('7', 42, 'ბესო პროექტს იწყებს 2027 წელს', 'გასაგებია');

    expect(mockSubmitFact).toHaveBeenCalledWith(
      '7',
      '995599111222',
      'note',
      'პროექტს იწყებს 2027 წელს',
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
