import { looksLikeStopRequest } from '../stopIntent';

/**
 * Ticket 20 row 113, eighth pass — the MARK was late, not the withholding.
 *
 * The tester's diagnosis, and better than mine. Goal 4724, thread 16836, the
 * stop typed one second into the gpt write stage:
 *
 *   17:43:53.119  present_choices — the write stage starts
 *   17:43:54.08   the owner types the stop
 *   17:43:58.607  their line is stored
 *   17:44:00.027  the run's reply is stored anyway, with two buttons
 *   17:44:05.581  update_task finally closes the goal
 *
 * Eleven seconds between the owner pressing enter and anything knowing about
 * it, because a typed stop did nothing until the model chose to act on it.
 */
describe('looksLikeStopRequest', () => {
  it('reads the line the tester actually typed', () => {
    expect(looksLikeStopRequest('გააჩერე ეს მიზანი, ტესტი იყო.')).toBe(true);
  });

  it('reads a bare stop, which is all most people type', () => {
    for (const line of ['გააჩერე', 'გააჩერე.', 'შეაჩერე', 'stop', 'Stop please']) {
      expect(looksLikeStopRequest(line)).toBe(true);
    }
  });

  // Row 215 took „however long the sentence" out of this name: a stop that
  // names its goal is still an instruction, and instructions are short. Both
  // of these are well inside the bound (43 and 38 characters).
  it('reads a stop that names the goal', () => {
    expect(looksLikeStopRequest('შეაჩერე ეს დავალება, აღარ მჭირდება, მადლობა')).toBe(true);
    expect(looksLikeStopRequest('stop this goal, it was only a test run')).toBe(true);
  });

  /**
   * Ticket 20 row 215 — „no goal" is not naming a goal, and „stop using
   * Netai" is not stopping one.
   *
   * The seat, 18 September, threads 18316 and 18317, the same sentence twice:
   *
   *   „Two quick things, no goal: what can you not do for me, and what
   *    happens to my contacts if I stop using Netai."
   *   → „There is no goal to stop in this conversation."  593 ms, no tools
   *
   * Both halves fired and neither meant what the rule thought. Their control
   * run — the same sentence without „no goal" — did NOT trigger it, which is
   * what proved the phrase was the cause rather than the wording around it.
   */
  it('does not read a long sentence that merely mentions a goal and a stop', () => {
    const asked =
      'Two quick things, no goal: what can you not do for me, and what happens ' +
      'to my contacts if I stop using Netai.';
    expect(looksLikeStopRequest(asked)).toBe(false);
    // Their control: no „goal" in it at all, and it must stay false.
    expect(
      looksLikeStopRequest(
        'Two quick things: what can you not do for me, and what happens to my ' +
          'contacts if I stop using Netai.',
      ),
    ).toBe(false);
  });

  it('does not read a NEGATED goal as a goal named, even when it is short', () => {
    // „no goal needed, just stop" is somebody saying there is no goal here.
    expect(looksLikeStopRequest('no goal, but can you stop guessing my city')).toBe(false);
    expect(looksLikeStopRequest('not a goal — stop suggesting people I know')).toBe(false);
    expect(looksLikeStopRequest('აქ მიზანი არ არის, გააჩერე ვარაუდები ჩემს ქალაქზე')).toBe(false);
  });

  /**
   * The bound is a trade and this is the side of it that loses. A genuine
   * stop written at length now goes to the model instead of being answered
   * from code — which is what happened for months before this fast path
   * existed. A miss costs seconds; a false positive closes a goal somebody
   * wanted and throws away the answer they were waiting for.
   */
  it('hands a LONG genuine stop back to the model rather than guessing', () => {
    const long =
      'please stop the goal about finding movers, I have already found someone ' +
      'myself and do not need it any more';
    expect(long.length).toBeGreaterThan(60);
    expect(looksLikeStopRequest(long)).toBe(false);
  });

  /**
   * The case the length rule exists for, and the reason this is narrow at all:
   * a false positive closes a goal somebody wanted and throws away the answer
   * they were waiting for. „Stop sending the question to Dato" is about one
   * message, and closing the whole goal on it is the assistant deciding
   * something nobody asked for.
   */
  it('does NOT read a stop aimed at something other than the goal', () => {
    for (const line of [
      'გააჩერე კითხვის გაგზავნა დათოსთვის',
      'გააჩერე და მომიყევი რა იპოვე ამ ხალხზე',
      'stop sending messages to Dato please, but keep looking',
      'შეწყვიტე მიწერა ნინოსთან და სხვას მოძებნე',
    ]) {
      expect(looksLikeStopRequest(line)).toBe(false);
    }
  });

  it('does not fire on an ordinary line that has no stop in it at all', () => {
    for (const line of [
      'მჭირდება ბუღალტერი მცირე ბიზნესისთვის',
      'რომელი მიზნები მაქვს ღია',
      'ok',
      'გაუგზავნე',
      '',
    ]) {
      expect(looksLikeStopRequest(line)).toBe(false);
    }
  });

  it('does not fire on a word that merely CONTAINS a stop stem', () => {
    // „გაჩერება" is the noun; the trap is a word that starts differently and
    // happens to carry the letters — the same word-start rule the rest of this
    // codebase learned the hard way.
    expect(looksLikeStopRequest('ავტობუსის გაჩერებასთან შევხვდეთ')).toBe(false);
  });
});
