jest.mock('../../config/openai', () => ({ __esModule: true, openaiClient: () => null }));
jest.mock('../finalAnswer.service', () => ({
  __esModule: true,
  finalAnswerModel: () => '',
  toLedgerUsage: () => ({}),
}));
jest.mock('../costLedger.service', () => ({ __esModule: true, recordClaudeUsage: async () => {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { introductionQueryWithoutAModel, distilIntroductionLocally } from '../searchQuery.service';

/**
 * ROW 253's SECOND DOOR: THE WEB HALF WAS CLOSED AND THE NAME STILL LEFT.
 *
 * Last night's change skips the web search when the goal asks to reach a named
 * person. It sits AFTER `distilSearchQuery`, which is a model call on OpenAI —
 * a second provider, not the one the conversation runs on — and it was handed
 * the goal text with the name in it every time. I wrote that down the same
 * night rather than let „253 is fixed" stand, and this is the other half.
 *
 * The query is now built from the owner's own words, here, with no call behind
 * it at all.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT CLAIM: that the local query finds the
 * same people the model's did. That is a live measurement on a real book and
 * the tester has it. What is asserted here is what can be: the shapes it
 * reads, the one it refuses, and that the call site takes the branch — because
 * the call site is what the first version of last night's skip got wrong.
 */
describe('an introduction goal is distilled without a second provider', () => {
  /**
   * The five phrasings, from the logged goals rather than from imagination.
   * Every expectation below is a row in `tool_call_log`.
   */
  it.each([
    ['Please introduce me to Netai Test 2.', 'Netai Test 2'],
    ['Ask Netai Test 1 to introduce me to Netai Test 4.', 'Netai Test 4'],
    ['I want to be introduced to Netai Test 9. Netai Test 8 knows them.', 'Netai Test 9'],
    [
      'I want to be introduced to Netai Test 9 through Netai Test 8, because I want to compare notes.',
      'Netai Test 9',
    ],
    [
      'Arrange a meeting with Netai Test 10 next week to talk about a joint marketing project.',
      'Netai Test 10',
    ],
    ['მჭირდება ანა ოსეფაშვილთან დაკავშირება — იცნობ თუ არა?', 'ანა ოსეფაშვილთან'],
  ])('reads the name out of %j', (goal, expected) => {
    expect(introductionQueryWithoutAModel(goal)).toBe(expected);
  });

  /**
   * „Test 6-თან" — a Georgian case ending hung off a name that is not Georgian.
   *
   * `georgianStem` trims „თან" downstream and never sees this one, because the
   * word it is attached to is Latin. Ticket 20 row 10 is the same fault the
   * other way round: „რატიანს" matched nobody over one letter.
   */
  it('takes a Georgian case ending off a Latin name', () => {
    expect(introductionQueryWithoutAModel('Netai Test 6-თან დაკავშირება მჭირდება — იცნობ?')).toBe(
      'Netai Test 6',
    );
  });

  /**
   * THE ONE IT GETS WRONG, AND IT SAYS SO INSTEAD.
   *
   * A real goal, 19 September: four sentences ending „…ნინია აბრამიშვილთან
   * პირდაპირი შეკითხვა, აქსელთან დაკავშირებით რჩევასთან დაკავშირებით." The
   * person being reached is six words and one comma away from the phrase that
   * names the act. No rule that reads a position in a sentence gets that right,
   * and the first version of this one answered „აქსელთან დაკავშირებით
   * რჩევასთან" — three words, one of them the phrase itself, which sailed past
   * the two-word floor.
   *
   * It must decline, and declining is not a leak: the caller falls back to the
   * goal text as typed, which is the path this module has always taken when the
   * model failed. Slow, occasionally empty, and never out of the building.
   */
  it('refuses to guess when no name sits beside the phrase', () => {
    const rambling =
      'ნინიას უკვე მივწერე. პასუხს ველოდები. ამ საქმეზე ერთადერთი გზაა ნინია ' +
      'აბრამიშვილთან პირდაპირი შეკითხვა, აქსელთან დაკავშირებით რჩევასთან დაკავშირებით.';

    expect(introductionQueryWithoutAModel(rambling)).toBe('');
    expect(distilIntroductionLocally(rambling)).toEqual({ query: rambling });
  });

  /** A declined query carries no `fromGoal`, so the log does not claim a change. */
  it('does not report a distillation it did not do', () => {
    expect(distilIntroductionLocally('გამაცანი').fromGoal).toBeUndefined();
    expect(distilIntroductionLocally('Please introduce me to Netai Test 2.')).toEqual({
      query: 'Netai Test 2',
      fromGoal: 'Please introduce me to Netai Test 2.',
    });
  });
});

/**
 * AND THE WIRE, WHICH IS THE ONLY PART A SABOTAGE SWEEP CANNOT ALREADY SEE.
 *
 * Every test above holds the FUNCTION. Last night's lesson, three times over,
 * is that the piece is tested from every angle and the line that calls it is
 * not — and last night's own first draft put the skip where the promise is
 * awaited rather than where it is started, which would have skipped nothing.
 *
 * The order is the whole fix here: `goalAsksToReachAPerson` must be read BEFORE
 * `distilSearchQuery` is reached, or the name has already gone to OpenAI by the
 * time anything decides it should not.
 */
describe('the call site takes the local branch, and takes it in time', () => {
  const opening = readFileSync(join(__dirname, '..', 'openingSearch.service.ts'), 'utf8');

  it('branches on the flag instead of always calling the model', () => {
    expect(opening).toContain('? distilIntroductionLocally(query)');
    expect(opening).toContain(': await distilSearchQuery(query, { userId, runId })');
  });

  it('decides before the model call exists to be made', () => {
    const decidedAt = opening.indexOf('const reachingForAPerson = goalAsksToReachAPerson(query);');
    const distilledAt = opening.indexOf('distilSearchQuery(query, { userId, runId })');

    expect(decidedAt).toBeGreaterThan(0);
    expect(distilledAt).toBeGreaterThan(decidedAt);
  });

  /** One decision, read once — a second call could answer differently. */
  it('reads the flag once and reuses it', () => {
    expect(opening.split('goalAsksToReachAPerson(query)')).toHaveLength(2);
  });
});
