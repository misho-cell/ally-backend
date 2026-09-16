/**
 * Ticket 20 row 129 — the final answer written by OpenAI.
 *
 * The property that has to hold is not "it calls the API". It is that the
 * gathered results SURVIVE the crossing: a run spends up to a minute searching
 * and the reply is written from what it found, so a converter that quietly
 * drops tool results would produce a fluent answer with nothing in it. That is
 * worse than a clumsy answer and it would read as a model problem rather than
 * a plumbing one.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { toOpenAiMessages, toLedgerUsage } from '../finalAnswer.service';

const SYSTEM = 'შენ ხარ ასისტენტი.';

describe('the run history crossing to OpenAI', () => {
  it('puts the system prompt first and keeps the roles', () => {
    const out = toOpenAiMessages(
      [
        { role: 'user', content: 'ვინ არის თბილისის მერი?' },
        { role: 'assistant', content: 'ვამოწმებ.' },
      ],
      SYSTEM,
    );

    expect(out).toEqual([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: 'ვინ არის თბილისის მერი?' },
      { role: 'assistant', content: 'ვამოწმებ.' },
    ]);
  });

  it('carries what the tools FOUND — the thing the answer is made of', () => {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: 'ვის ვიცნობ სანტექნიკოსს?' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'ვეძებ ქსელში.' },
          {
            type: 'tool_use',
            id: 'a1',
            name: 'search_by_tag',
            input: { tag_query: 'სანტექნიკოსი' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'a1',
            content: '{"found":true,"results":["Gega","Nino"]}',
          },
        ],
      },
    ];

    const out = toOpenAiMessages(messages, SYSTEM);
    const all = out.map((m) => String(m.content)).join('\n');

    // The names the reply will be built from.
    expect(all).toContain('Gega');
    expect(all).toContain('Nino');
    // Which tool produced them, and what it was asked.
    expect(all).toContain('search_by_tag');
    expect(all).toContain('სანტექნიკოსი');
    // And the model's own narration alongside its call, not instead of it.
    expect(all).toContain('ვეძებ ქსელში.');
  });

  it('flattens a tool_result whose content is a block array', () => {
    const out = toOpenAiMessages(
      [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'b2',
              content: [{ type: 'text', text: 'ორი შედეგი მოიძებნა' }],
            },
          ],
        },
      ],
      SYSTEM,
    );

    expect(String(out[1].content)).toContain('ორი შედეგი მოიძებნა');
  });

  it('drops a turn that flattens to nothing — the API rejects empty content', () => {
    const out = toOpenAiMessages(
      [
        { role: 'user', content: 'კითხვა' },
        { role: 'assistant', content: [] },
        { role: 'assistant', content: '   ' },
      ],
      SYSTEM,
    );

    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({ role: 'user', content: 'კითხვა' });
  });

  it('caps one oversized result instead of letting it crowd out the rest', () => {
    const out = toOpenAiMessages(
      [
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'c3', content: 'x'.repeat(9000) }],
        },
        { role: 'assistant', content: 'პასუხი' },
      ],
      SYSTEM,
    );

    expect(String(out[1].content).length).toBeLessThan(4_200);
    // The turns after it still arrive — that is what the cap is protecting.
    expect(out[2]).toEqual({ role: 'assistant', content: 'პასუხი' });
  });
});

/**
 * The billing half. A model whose tokens are counted wrongly is a model whose
 * users are charged wrongly, and the direction that matters is under-counting:
 * debitRun skips a run costing zero, so a mapping that loses tokens gives the
 * product away.
 */
describe('OpenAI token counts in the ledger’s four terms', () => {
  it('does not bill the cached tokens twice — prompt_tokens already includes them', () => {
    const usage = toLedgerUsage({
      prompt_tokens: 32_000,
      completion_tokens: 700,
      total_tokens: 32_700,
      prompt_tokens_details: { cached_tokens: 30_000 },
    } as never);

    expect(usage.input_tokens).toBe(2_000);
    expect(usage.cache_read_input_tokens).toBe(30_000);
    expect(usage.output_tokens).toBe(700);
    // Every prompt token is accounted for exactly once.
    expect((usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)).toBe(32_000);
  });

  it('reports no cache WRITE, because OpenAI does not charge for one', () => {
    // This is the fact the hybrid's whole cost case rests on: cache writes are
    // 66% of our Anthropic bill and there is no equivalent line here.
    const usage = toLedgerUsage({
      prompt_tokens: 100,
      completion_tokens: 10,
      total_tokens: 110,
    } as never);

    expect(usage.cache_creation_input_tokens).toBe(0);
    expect(usage.cache_read_input_tokens).toBe(0);
    expect(usage.input_tokens).toBe(100);
  });

  it('a missing usage block counts zero rather than throwing', () => {
    expect(toLedgerUsage(undefined)).toEqual({
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    });
  });

  it('never returns a negative input count if the provider’s numbers disagree', () => {
    const usage = toLedgerUsage({
      prompt_tokens: 100,
      completion_tokens: 5,
      total_tokens: 105,
      prompt_tokens_details: { cached_tokens: 900 },
    } as never);

    expect(usage.input_tokens).toBe(0);
  });
});
