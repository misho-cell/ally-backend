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

  it('reads a stop that names the goal, however long the sentence', () => {
    expect(looksLikeStopRequest('შეაჩერე ეს დავალება, აღარ მჭირდება, მადლობა')).toBe(true);
    expect(looksLikeStopRequest('stop this goal, it was only a test run')).toBe(true);
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
