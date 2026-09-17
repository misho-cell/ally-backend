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
import { toOpenAiMessages, toLedgerUsage, unusableReason } from '../finalAnswer.service';

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

/**
 * Ticket 20 row 155 — nothing the model writes reaches a thread unless it is a
 * reply.
 *
 * On Ninia's account, while a tester was working in it, two messages were
 * stored as ordinary replies with the plan buttons under them: 1,177
 * characters of the model's own English reasoning on goal 4100, and a broken
 * tool call with CJK and Cyrillic spam on goal 4126 — after which that goal's
 * first pass simply ended and the owner got no answer.
 *
 * Measured by answered_by since 10 September: gpt-5.6-terra 2 of 71, Sonnet 5
 * 0 of 19, and 0 tool syntax in the 2,380 before the hybrid. This path, at
 * about one reply in thirty-five.
 */
describe('row 155 — an answer that is not a reply is refused', () => {
  it('refuses the tool protocol the run flattened into its own history', () => {
    // The cause: toOpenAiMessages renders tool calls as „[tool x] {…}" lines,
    // and a model handed that shape sometimes continues it. tool_choice: none
    // stops it CALLING a tool; it does not stop it writing what one looks like.
    expect(
      unusableReason('[tool search_by_tag] to=functions {"tag_query": "ყვავილები"}', 'ka'),
    ).toBe('tool syntax');
    expect(unusableReason('{"tag_query": "ყვავილები"} და კიდევ რაღაც ტექსტი აქ', 'ka')).toBe(
      'tool syntax',
    );
  });

  it('refuses characters from a script no conversation here uses', () => {
    expect(unusableReason('ყვავილების მაღაზია 花火大会 ვაკეში', 'ka')).toBe('CJK characters');
    expect(unusableReason('ყვავილების магазин ვაკეში', 'ka')).toBe('Cyrillic in a Georgian thread');
  });

  it('refuses a Georgian thread’s reply that carries no Georgian at all', () => {
    // Goal 4100's shape. Deliberately a test about the ALPHABET rather than
    // the words: judging „is this reasoning rather than an answer" would mean
    // reading it, and this does not have to.
    const reasoning =
      'We need respond next user? No current user only result event. Need likely wait no reply. ' +
      'But must answer event? The plan is proposed already so maybe nothing.';

    expect(unusableReason(reasoning, 'ka')).toBe('no Georgian in a Georgian thread');
  });

  it('leaves an ordinary Georgian answer alone', () => {
    expect(
      unusableReason('ვიპოვე ორი ყვავილების მაღაზია ვაკეში. რომელს დავუკავშირდე?', 'ka'),
    ).toBeNull();
  });

  it('leaves an English answer alone in an English thread', () => {
    expect(
      unusableReason('I found two flower shops in Vake. Which one should I contact for you?', 'en'),
    ).toBeNull();
  });

  it('does not judge a short Latin line — a name or a link is not reasoning', () => {
    // Refusing costs an answer, so below the length where the test can mean
    // anything it does not fire.
    expect(unusableReason('Infinity Solutions', 'ka')).toBeNull();
    expect(unusableReason('https://netai.guru/chat/16243', 'ka')).toBeNull();
  });

  it('still refuses an empty answer, and says which rule that was', () => {
    expect(unusableReason('   ', 'ka')).toBe('empty');
  });
});

/**
 * Row 155, the share rule — and the same mistake this file's own header
 * describes me making all week: the rule above covers „not ONE Georgian
 * letter", and one Georgian word defeats it.
 *
 * The threshold was not chosen, it was measured. Every stored assistant reply
 * in a Georgian thread over 30 days — a thread counts as Georgian when the
 * OWNER's own letters are mostly Georgian — gives ten replies under 45%:
 *
 *   0.000, 0.000  long English answers            already refused
 *   0.026         783 Latin letters, 21 Georgian  was NOT refused
 *   0.057         the model's own deliberation    was NOT refused
 *   0.247         an English plan body            was NOT refused
 *   0.285         a Georgian answer listing degrees and universities
 *   0.356, 0.378  „ვებში ეს ვიპოვე: • <English web title> — …"
 *   0.414, 0.414  a Georgian plan line and a ranked list, names in Latin
 *
 * The bottom four are replies not written in the conversation at all; the top
 * five are Georgian replies whose Latin bulk is DATA. The fixtures below are
 * built to the same shares (real names replaced), so the margin on either side
 * of 0.20 is what the tests actually hold.
 */
describe('row 155 — a reply that is barely Georgian in a Georgian thread', () => {
  it('refuses a long English answer with one Georgian word dropped in', () => {
    // The 0.026 row. The alphabet rule above passes it on that one word.
    const answer =
      'Your direct contacts with a connection there: the strongest by far is the one who spent ' +
      'fifteen years inside the organisation as director of corporate sales, so she knows it from ' +
      'the inside. She has since left and now runs her own consultancy (ქსელი).';

    expect(unusableReason(answer, 'ka')).toBe('barely Georgian in a Georgian thread (2%)');
  });

  it('refuses the model’s own deliberation when it ends in Georgian', () => {
    // The 0.057 row, read off a real thread. The owner saw this.
    const leak =
      'We need respond next user? No current user only result event. Need likely wait no reply. ' +
      'But must answer event? It presented true after assistant response. Nothing to do. ' +
      'However current turn must final perhaps empty impossible. ენა ქართულია.';

    expect(unusableReason(leak, 'ka')).toBe('barely Georgian in a Georgian thread (6%)');
  });

  it('LEAVES ALONE a Georgian answer whose Latin bulk is degrees and universities', () => {
    // The 0.285 row, and the closest legitimate reply to the threshold. If this
    // ever starts failing the threshold has been raised onto real answers.
    const credentials =
      'ეს კარგი სურათია. ყველაზე ძლიერები საზღვარგარეთის განათლებით:\n' +
      '1. BBA, Odisee Brussels; Advanced Management Programme, INSEAD\n' +
      '2. MBA, Grenoble Ecole de Management; Harvard Public Leadership; Draper University\n' +
      '3. MSc International Business, Rotterdam School of Management\n' +
      '4. LLM, Central European University; Chartered Financial Analyst\n' +
      'დანარჩენები ადგილობრივი განათლებით.';

    expect(unusableReason(credentials, 'ka')).toBeNull();
  });

  it('LEAVES ALONE the web-results line, whose titles are English by nature', () => {
    // The 0.356 and 0.378 rows. Our own Georgian frame around foreign titles.
    const fromTheWeb =
      'ვებში ეს ვიპოვე:\n' +
      '• Canned Foods Marketing Strategies for 2026 — კავშირი ვერ შევამოწმე.\n' +
      '• 10 Best Food Marketing Agencies for CPG Brands — კავშირი ვერ შევამოწმე.\n' +
      '• The Top Food and Beverage Marketing Agencies — კავშირი ვერ შევამოწმე.';

    expect(unusableReason(fromTheWeb, 'ka')).toBeNull();
  });

  it('does not weigh the share of a short line — two names are not a language', () => {
    // Under the letter floor the share means nothing: a plan line naming three
    // companies can be more Latin than Georgian and still be a Georgian reply.
    expect(unusableReason('კი — Element Construction, Maqro Construction.', 'ka')).toBeNull();
  });

  it('does not touch a thread held in another language', () => {
    const leak =
      'We need respond next user? No current user only result event. Need likely wait no reply. ' +
      'But must answer event? It presented true after assistant response. Nothing to do.';

    expect(unusableReason(leak, 'en')).toBeNull();
  });
});
