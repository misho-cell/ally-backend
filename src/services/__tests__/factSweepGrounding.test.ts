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
