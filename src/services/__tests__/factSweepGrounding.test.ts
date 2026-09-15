jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
// Must resolve: the sweep chains .catch() on it, and a mock returning
// undefined threw inside the try — which made the first test pass for the
// wrong reason (nothing was written because the sweep had already died).
jest.mock('../costLedger.service', () => ({
  recordClaudeUsage: jest.fn().mockResolvedValue(undefined),
  __esModule: true,
}));
jest.mock('../contactFacts.service', () => ({
  __esModule: true,
  submitContactFact: jest.fn(),
  FACT_FIELD_TYPES: ['occupation', 'employer', 'city', 'industry', 'past_role', 'role'],
}));
jest.mock('../tools/nameMatch', () => ({
  __esModule: true,
  findContactPhonesByName: jest.fn(),
}));

const mockCreate = jest.fn();
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: mockCreate } },
}));

import { query } from '../../db/postgres/client';
import { submitContactFact } from '../contactFacts.service';
import { findContactPhonesByName } from '../tools/nameMatch';
import { sweepFactsFromExchange } from '../factExtraction.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSubmit = submitContactFact as jest.MockedFunction<typeof submitContactFact>;
const mockNames = findContactPhonesByName as jest.MockedFunction<typeof findContactPhonesByName>;

function modelReturns(candidates: unknown[]): void {
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify(candidates) }],
    usage: { input_tokens: 1, output_tokens: 1 },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNames.mockResolvedValue(['+995599000001']);
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
  mockSubmit.mockResolvedValue({ saved: true } as never);
});

// 2 September: the assistant read a clinic's web page and named two doctors;
// within a minute the sweep had stored four PUBLIC facts about two real people
// that nobody had typed. The exchange handed to the model contains the whole
// assistant reply, and the model read it as the user's knowledge.
describe("the fact sweep stores the user's knowledge, not the assistant's", () => {
  it("drops a fact that appears only in the assistant's reply", async () => {
    modelReturns([
      {
        person_name: 'Misha Omiadze',
        field_type: 'employer',
        value: 'კავკასიის მედიცინის ცენტრი',
        confidence: 'stated',
      },
    ]);

    await sweepFactsFromExchange(
      '501',
      1,
      'გამარჯობა, თვალის ექიმი ვის ურჩევ ბათუმში?',
      'მიხეილ ომიაძე მუშაობს კავკასიის მედიცინის ცენტრში…',
    );

    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('keeps a fact the user typed themselves', async () => {
    modelReturns([
      { person_name: 'Nika', field_type: 'employer', value: 'Altituda', confidence: 'stated' },
    ]);

    await sweepFactsFromExchange('501', 1, 'ნიკა Altituda-ს დამფუძნებელია', 'გასაგებია.');

    expect(mockSubmit).toHaveBeenCalledWith(
      '501',
      '+995599000001',
      'employer',
      'Altituda',
      'sweep',
      'stated',
    );
  });

  it('a short agreement confirms what the assistant just said', async () => {
    modelReturns([
      { person_name: 'Nika', field_type: 'city', value: 'ბათუმი', confidence: 'stated' },
    ]);

    await sweepFactsFromExchange('501', 1, 'დიახ, სწორია', 'ნიკა ბათუმში ცხოვრობს, ხომ?');

    expect(mockSubmit).toHaveBeenCalled();
  });

  it('a role the person left becomes past_role, never employer', async () => {
    modelReturns([
      { person_name: 'Tamara', field_type: 'employer', value: 'Wissol', confidence: 'stated' },
    ]);

    await sweepFactsFromExchange(
      '501',
      1,
      'თამარი 15 წელი Wissol-ში მუშაობდა, 2022-ში წამოვიდა',
      'გასაგებია.',
    );

    expect(mockSubmit.mock.calls[0][2]).toBe('past_role');
  });

  it('never stores the same thing twice on one person', async () => {
    modelReturns([
      { person_name: 'Nika', field_type: 'note', value: 'რაგბი', confidence: 'stated' },
    ]);
    mockQuery.mockResolvedValue({
      rows: [{ value: 'ნიკა რაგბის თამაშობს' }],
      rowCount: 1,
    } as never);

    await sweepFactsFromExchange('501', 1, 'ნიკა რაგბის თამაშობს კიდეც', 'გასაგებია.');

    expect(mockSubmit).not.toHaveBeenCalled();
  });
});

/**
 * Ticket 19 [5] — the founder's own account, 13 September.
 *
 * Seven facts about seven real people, all `source: sweep`, every one a
 * sentence the assistant had composed a moment earlier. They were let through
 * because a question and its answer share their topic word: he asked „who do
 * I know in logistics", the assistant answered with a description, and
 * „logistics" in the description was taken as proof that he knew it.
 *
 * Each case below is a real row and the real message behind it.
 */
describe('a question is not a statement', () => {
  async function sweepAfter(userMessage: string, value: string): Promise<boolean> {
    modelReturns([{ person_name: 'X', field_type: 'note', value, confidence: 'mentioned' }]);
    await sweepFactsFromExchange('501', 1, userMessage, 'the assistant said all of this');
    return mockSubmit.mock.calls.length > 0;
  }

  it('fact 4957 — „Who do I know at Bank of Georgia?"', async () => {
    expect(
      await sweepAfter(
        'Who do I know at Bank of Georgia?',
        'won Best Banker at Bank of Georgia in 2012',
      ),
    ).toBe(false);
  });

  it('fact 4958 and 4959 — „Who in my network works in logistics?"', async () => {
    expect(
      await sweepAfter(
        'Who in my network works in logistics?',
        '13 years in international logistics and supply chain, Azerbaijan connections',
      ),
    ).toBe(false);
  });

  it('fact 4956 — „Who runs a family business among my contacts?"', async () => {
    expect(
      await sweepAfter(
        'Who runs a family business among my contacts?',
        "runs Proservice, his father's business, as GM",
      ),
    ).toBe(false);
  });

  it('fact 4986 — „Who do I know who works in the film industry?"', async () => {
    expect(await sweepAfter('Who do I know who works in the film industry?', 'film producer')).toBe(
      false,
    );
  });

  it('fact 4955 — a statement next to a question grounds only what it says', async () => {
    // „Tax structuring for a new company." is his. The nine-word description
    // of a lawyer's practice is not, and „company" is the only word they share.
    expect(
      await sweepAfter(
        'Tax structuring for a new company. Why Arjevanidze and not Teona?',
        'specializes in jurisdiction selection, company formation, asset protection, legal entity structuring',
      ),
    ).toBe(false);
  });

  it('fact 4985 — the topic twice over is still only the topic', async () => {
    // „I have a supervision problem with City Hall" is his sentence. The half
    // that makes this a fact about a person — the relationship — is nobody's.
    expect(
      await sweepAfter(
        'Who in my network can help with construction permits in Tbilisi? I have a supervision problem with City Hall.',
        'has formal relationship with user, knows City Hall and construction',
      ),
    ).toBe(false);
  });

  it('still keeps what the person actually asserted, question or no question', async () => {
    // The cost of the rule is real and bounded: a fact stated OUTSIDE the
    // question survives untouched.
    expect(
      await sweepAfter('დავით ალავიძე მერიაში მუშაობს. როგორ მივწვდე?', 'მერიაში მუშაობს'),
    ).toBe(true);
  });

  it('a year only the assistant said does not ride along', async () => {
    // The year strip was handed the whole exchange to check against, so a year
    // the assistant had just written always counted as stated.
    modelReturns([
      { person_name: 'X', field_type: 'note', value: 'Best Banker in 2012', confidence: 'stated' },
    ]);

    await sweepFactsFromExchange(
      '501',
      1,
      'იყო Best Banker, არ მახსოვს რომელ წელს',
      'Best Banker at Bank of Georgia in 2012',
    );

    expect(mockSubmit.mock.calls[0]?.[3]).toBe('Best Banker in');
  });
});
