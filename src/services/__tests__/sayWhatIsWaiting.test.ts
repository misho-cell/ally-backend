import { renderPendingMessage } from '../pendingMessages';

/**
 * ⚠️ ROW 250 — „N MORE UPDATES ARE WAITING" WITHOUT SAYING WHAT THEY ARE.
 * The tester raised it THREE times on 25 September before I took it.
 *
 * The founder's rule: say what they are, or do not appear.
 *
 * A bare number is a demand on somebody's attention with nothing to weigh it
 * against. „9 more updates" could be nine search results or nine people
 * waiting on an answer, and those deserve very different amounts of worry.
 *
 * HIS OWN NINE, read from the base while building this: SIX questions on his
 * own goals, two debriefs, one search result — and the six are the same six
 * goals the reply had just listed to him. Naming them does not create that
 * overlap, it makes it visible; hiding it behind a number is what let it
 * stand for weeks. The overlap itself is a product decision and it is with
 * the founder.
 */
const item = (payload: Record<string, unknown>) => ({
  kind: 'more_pending',
  task_id: null,
  payload,
});

describe('it says what is waiting', () => {
  it('names the kinds instead of counting them', () => {
    const out = renderPendingMessage(
      item({ count: 9, by_kind: { goal_question: 6, debrief: 2, search_followup: 1 } }),
      'en',
    );

    expect(out?.text).toContain('6 questions on your goals');
    expect(out?.text).toContain('2 "how did it go" questions');
    expect(out?.text).toContain('one search result');
    expect(out?.text).not.toContain('9 more updates');
  });

  /** The part somebody has to decide on goes first, not the single stray item. */
  it('puts the biggest group first', () => {
    const out = renderPendingMessage(
      item({ count: 9, by_kind: { search_followup: 1, goal_question: 6, debrief: 2 } }),
      'en',
    );
    const text = String(out?.text);

    expect(text.indexOf('6 questions')).toBeLessThan(text.indexOf('2 "how'));
    expect(text.indexOf('2 "how')).toBeLessThan(text.indexOf('one search result'));
  });

  it('speaks Georgian in a Georgian conversation', () => {
    const out = renderPendingMessage(item({ count: 6, by_kind: { goal_question: 6 } }), 'ka');

    expect(out?.text).toContain('კითხვა შენს მიზნებზე');
    expect(out?.text).not.toMatch(/[a-z]{4}/i);
  });
});

describe('what it must not do', () => {
  /**
   * A kind nobody has named yet must make the line VAGUER, never shorter than
   * the truth. Dropping an unknown kind would under-report what is waiting,
   * which is the one direction this line must never fail in.
   */
  it('falls back to a plain word for a kind it does not know', () => {
    const out = renderPendingMessage(item({ count: 2, by_kind: { something_new: 2 } }), 'en');

    expect(out?.text).toContain('2 updates');
  });

  /** An older queued row has no breakdown and still has to render. */
  it('still renders the bare count when nothing said what they are', () => {
    const out = renderPendingMessage(item({ count: 4 }), 'en');

    expect(out?.text).toBe('4 more updates are waiting.');
  });

  it('says nothing at all when nothing is waiting', () => {
    expect(renderPendingMessage(item({ count: 0, by_kind: {} }), 'en')).toBeNull();
  });

  /** An empty breakdown is not a licence to print an empty sentence. */
  it('falls back rather than printing a list of nothing', () => {
    const out = renderPendingMessage(item({ count: 3, by_kind: {} }), 'en');

    expect(out?.text).toBe('3 more updates are waiting.');
  });

  it('keeps its buttons', () => {
    const out = renderPendingMessage(item({ count: 3, by_kind: { debrief: 3 } }), 'en');

    expect(out?.choices).toHaveLength(2);
  });
});
