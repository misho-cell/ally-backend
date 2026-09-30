jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));

import { buildAnswerWakeEvent, buildAnswersWakeEvent, ensureEveryQuote } from '../taskAsks.service';

/**
 * Row 322, goal 11155: six answers in eight seconds; the first took the
 * thread, the other five waited for the five-minute sweep and were relayed one
 * run each, 06:44–06:57, while the first run said „nobody else has answered".
 */
describe('answers that are waiting together are delivered together', () => {
  const SIX = [
    { answer: 'Yes, Baxva is a very good dentist.', fromName: 'Netai Test 27', verbatim: true },
    { answer: "I can't help with this one", fromName: 'Netai Test 28', verbatim: true },
    { answer: 'Dr. Baxva, my own dentist.', fromName: 'Netai Test 48', verbatim: false },
  ];

  it('puts every answer into one event, each with its own name', () => {
    const event = buildAnswersWakeEvent(SIX);
    for (const a of SIX) {
      expect(event).toContain(a.answer);
      expect(event).toContain(`from="${a.fromName}"`);
    }
    expect(event).toMatch(/^3 ადამიანმა გიპასუხა/);
  });

  it("marks which ones are their own words and which are their assistant's", () => {
    const event = buildAnswersWakeEvent(SIX);
    expect(event).toContain('from="Netai Test 27" (მისი ზუსტი სიტყვები — ციტატად)');
    expect(event).toContain('from="Netai Test 48" (მისი ასისტენტის ჩამოყალიბება');
  });

  it('forbids telling the owner the others have not answered', () => {
    expect(buildAnswersWakeEvent(SIX)).toMatch(/არ თქვა, რომ დანარჩენებს ჯერ არ უპასუხიათ/);
  });

  it('carries the agreed-is-not-connected rule once', () => {
    const event = buildAnswersWakeEvent(SIX);
    expect(event.match(/„დათანხმდა", არა „დაკავშირდნენ"/g)).toHaveLength(1);
  });

  it('is the ordinary single event when only one answer is waiting', () => {
    expect(buildAnswersWakeEvent([SIX[0]])).toBe(
      buildAnswerWakeEvent(SIX[0].answer, 'Netai Test 27', true),
    );
  });

  it('guarantees every answer reaches the reply, in order', () => {
    const out = ensureEveryQuote('Summary.', [
      { text: 'A says yes', who: 'A', verbatim: true },
      { text: 'B says no', who: 'B', verbatim: true },
    ]);
    expect(out).toBe('„A says yes" — A\n\n„B says no" — B\n\nSummary.');
  });

  it('adds nothing for answers the reply already carries', () => {
    const reply = 'A said: A says yes. B said: B says no.';
    expect(
      ensureEveryQuote(reply, [
        { text: 'A says yes', who: 'A', verbatim: true },
        { text: 'B says no', who: 'B', verbatim: true },
      ]),
    ).toBe(reply);
  });
});
