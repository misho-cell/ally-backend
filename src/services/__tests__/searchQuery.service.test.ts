const mockCreate = jest.fn();

jest.mock('../../config/openai', () => ({
  __esModule: true,
  openaiClient: (): unknown =>
    process.env.OPENAI_API_KEY ? { chat: { completions: { create: mockCreate } } } : null,
}));
jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordClaudeUsage: jest.fn().mockResolvedValue(undefined),
}));

import type { recordClaudeUsage as RecordFn } from '../costLedger.service';

/**
 * Re-acquired after every resetModules. The service reads its model from the
 * environment at call time but imports the ledger at load time, so a fresh
 * import brings a fresh copy of the mock with it — holding the old reference
 * watches a function nobody calls.
 */
let recordClaudeUsage: jest.MockedFunction<typeof RecordFn>;

const CTX = { userId: '501', runId: 'run-1' };

const GOAL = 'ნოტარიუსი მჭირდება ბინის ნასყიდობის ხელშეკრულებისთვის.';

function answers(text: string): void {
  mockCreate.mockResolvedValue({
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: 120, completion_tokens: 6 },
  });
}

let distilSearchQuery: typeof import('../searchQuery.service').distilSearchQuery;

beforeEach(async () => {
  jest.clearAllMocks();
  jest.resetModules();
  process.env.OPENAI_API_KEY = 'sk-test';
  process.env.CHAT_FINAL_ANSWER_MODEL = 'gpt-5.6-terra';
  delete process.env.SEARCH_QUERY_MODEL;
  ({ distilSearchQuery } = await import('../searchQuery.service'));
  recordClaudeUsage = (await import('../costLedger.service'))
    .recordClaudeUsage as jest.MockedFunction<typeof RecordFn>;
  answers('ნოტარიუსი ბათუმი');
});

/**
 * Ticket 20 row 126, fourth pass — the opening web search gets a query rather
 * than a sentence.
 *
 * Goal 3895 sent the owner's whole sentence and got back a microfinance blog
 * on mortgages, two law-firm articles about purchase contracts, a PDF of a
 * contract and a company document. Not one notary. The model was right to
 * ignore it: the search failed, not the reply.
 */
describe('distilSearchQuery', () => {
  it('turns the sentence into a short query', async () => {
    const out = await distilSearchQuery(GOAL, CTX);

    expect(out.query).toBe('ნოტარიუსი ბათუმი');
    // Both are kept, so a log can say what was asked as well as what came back.
    expect(out.fromGoal).toBe(GOAL);
  });

  /**
   * D298 — nothing assumes a city. My first version fetched the account's
   * stored city and offered it to the model; the seat caught it inside the
   * hour. A place belongs in a search only when the OWNER said it, and
   * whatever they said is already in the text being read.
   */
  it('is never told a city, and is told never to add one', async () => {
    await distilSearchQuery(GOAL, CTX);

    const sent = mockCreate.mock.calls[0][0];
    expect(sent.messages[1].content).toBe(`What they need:\n${GOAL}`);
    expect(sent.messages[0].content).toContain('NEVER add a place');
    expect(sent.messages[0].content).toContain('ONLY if the person named one');
  });

  /**
   * Goal 3928 repeated 3895's sentence and the distiller answered „ნოტარიუსი
   * ბინის ნასყიდობის ხელშეკრულება" — shorter, and four of five results were
   * still articles. The purpose is what pulls them: every notary does those
   * contracts, so the words only select for people writing about them.
   */
  it('is told to drop the purpose and keep what narrows the provider', async () => {
    // Asserted on the brief as it is sent, because the behaviour it buys
    // belongs to a model and only the instruction is ours to guarantee.
    await distilSearchQuery(GOAL, CTX);
    const brief = mockCreate.mock.calls[0][0].messages[0].content as string;

    expect(brief).toContain('WHAT KIND of provider');
    expect(brief).toContain('WHY they are wanted');
    // Both worked examples are real goals of ours, and the rule without them
    // reads as „be brief" — which is the instruction that produced 3928.
    expect(brief).toContain('Toyota Prius hybrid battery repair');
    expect(brief).toContain('law-firm blogs');
  });

  it('charges the call, because it is one', async () => {
    await distilSearchQuery(GOAL, CTX);

    expect(recordClaudeUsage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'search_query', provider: 'openai', runId: 'run-1' }),
    );
  });

  /**
   * The half that matters. This runs before the model's first turn and holds
   * up the opening web search, which holds up the first reply. Every failure
   * has to land on the behaviour we already have.
   */
  describe('it can only improve the query or leave it alone', () => {
    it('falls back to the sentence when the call fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      mockCreate.mockRejectedValue(new Error('timeout'));

      const out = await distilSearchQuery(GOAL, CTX);

      expect(out).toEqual({ query: GOAL });
      consoleSpy.mockRestore();
    });

    it('falls back when there is no key at all', async () => {
      delete process.env.OPENAI_API_KEY;
      jest.resetModules();
      ({ distilSearchQuery } = await import('../searchQuery.service'));

      const out = await distilSearchQuery(GOAL, CTX);

      expect(out).toEqual({ query: GOAL });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('falls back when no model is configured — off is exactly today', async () => {
      delete process.env.CHAT_FINAL_ANSWER_MODEL;
      jest.resetModules();
      ({ distilSearchQuery } = await import('../searchQuery.service'));

      expect(await distilSearchQuery(GOAL, CTX)).toEqual({ query: GOAL });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('rejects an answer that is another sentence rather than a query', async () => {
      answers(
        'I understand you are looking for a notary. Here is what I would suggest ' +
          'searching for, although it depends on which district you live in and ' +
          'whether the contract is already drafted by somebody else.',
      );

      expect((await distilSearchQuery(GOAL, CTX)).query).toBe(GOAL);
    });

    it('rejects an empty answer', async () => {
      answers('   ');

      expect((await distilSearchQuery(GOAL, CTX)).query).toBe(GOAL);
    });

    it('takes the first line when the model adds an explanation under it', async () => {
      answers('ნოტარიუსი ბათუმი\n\nThis keeps the service word and the city.');

      expect((await distilSearchQuery(GOAL, CTX)).query).toBe('ნოტარიუსი ბათუმი');
    });

    it('strips the quotes a model likes to wrap a query in', async () => {
      answers('„ნოტარიუსი ბათუმი"');

      expect((await distilSearchQuery(GOAL, CTX)).query).toBe('ნოტარიუსი ბათუმი');
    });

    it('reports no change when the model hands the sentence straight back', async () => {
      answers(GOAL);

      // Not a rewrite, so nothing claims one — fromGoal stays absent and the
      // log does not show a distillation that did not happen.
      expect(await distilSearchQuery(GOAL, CTX)).toEqual({ query: GOAL });
    });
  });

  it('SEARCH_QUERY_MODEL overrides the final-answer model when it is set', async () => {
    process.env.SEARCH_QUERY_MODEL = 'gpt-cheap';
    jest.resetModules();
    ({ distilSearchQuery } = await import('../searchQuery.service'));
    answers('ნოტარიუსი ბათუმი');

    await distilSearchQuery(GOAL, CTX);

    expect(mockCreate.mock.calls[0][0].model).toBe('gpt-cheap');
  });
});
