import { cardHeading } from '../updateCard';

/**
 * ROW 73 — THREE CARDS ABOUT THREE PEOPLE LOOKED IDENTICAL ON A REAL SCREEN.
 *
 * Ninia, 28 September: „debrief · მიზანი #3995" twice and „#3137" three times,
 * and „from 'Goal #3367' we cannot tell what it is about".
 *
 * They were not duplicates. #3137's three are Giorgi Abramishvili, Tornike
 * Abuladze and Lika Ose — three different people who have not answered. The
 * data was right and the screen could not show it, because ten kinds carry
 * their words in nine different fields and one of them carries no words at all.
 */
describe('a card says what it is about', () => {
  it('uses the goal’s own words as the title, not the kind and a number', () => {
    const card = cardHeading('debrief', { who: 'Giorgi Abramishvili' }, 'Find an architect', 'en');

    expect(card.title).toBe('Find an architect');
    expect(card.title).not.toContain('debrief');
    expect(card.title).not.toContain('#');
  });

  /** The line that makes three identical cards three different cards. */
  it('names the person a debrief is waiting on', () => {
    const one = cardHeading('debrief', { who: 'Lika Ose' }, 'Find an architect', 'en');
    const two = cardHeading('debrief', { who: 'Tornike Abuladze' }, 'Find an architect', 'en');

    expect(one.detail).toContain('Lika Ose');
    expect(two).not.toEqual(one);
  });

  /**
   * ⚠️ THE `why` FIELD IS ENGLISH WHOEVER READS IT — it is written by the code
   * that queues the card. Using it would put the only English sentence on a
   * Georgian reader's screen, so the sentence is said here instead.
   */
  it('does not hand a Georgian reader the payload’s English sentence', () => {
    const card = cardHeading(
      'debrief',
      { who: 'Lika Ose', why: 'the question sent to Lika Ose has had no answer for 3 days' },
      'ვეტერინარის ძებნა',
      'ka',
    );

    expect(card.detail).toContain('Lika Ose');
    expect(card.detail).not.toContain('has had no answer');
  });

  /** Every kind, including the one that carries nothing but an id. */
  it('gives every kind a title, even the one with no words in it', () => {
    const kinds = [
      'debrief',
      'goal_question',
      'goal_feedback',
      'search_followup',
      'weekly_summary',
      'chorus_ask',
      'intro_expired',
      'thanks_loop',
      'no_luck',
      'found',
    ];

    for (const kind of kinds) {
      const card = cardHeading(kind, { search_id: 34156 }, null, 'ka');
      expect(card.title.length).toBeGreaterThan(0);
      expect(card.title).not.toBe(kind);
    }
  });

  it('speaks each of the four languages', () => {
    for (const language of ['ka', 'en', 'ru', 'es'] as const) {
      const card = cardHeading('weekly_summary', {}, null, language);
      expect(card.title.length).toBeGreaterThan(0);
    }
    expect(cardHeading('weekly_summary', {}, null, 'en').title).not.toBe(
      cardHeading('weekly_summary', {}, null, 'ka').title,
    );
  });

  /**
   * The summary's body is the card — eight screen-heights of it on her phone.
   * Putting its first line in the title repeats the body in the body's header.
   */
  it('does not put the weekly summary’s own text in its title', () => {
    const card = cardHeading(
      'weekly_summary',
      { text: 'კვირის შეჯამება\n\nაქტიური მიზნები: 2' },
      null,
      'ka',
    );

    expect(card.detail).toBe('');
    expect(card.title).not.toContain('აქტიური მიზნები');
  });

  /** A title under a list item, not a paragraph in it. */
  it('keeps the detail to one line', () => {
    const card = cardHeading('found', { summary: 'x'.repeat(900) }, null, 'en');

    expect(card.detail.length).toBeLessThanOrEqual(200);
    expect(card.detail).not.toContain('\n');
  });

  it('falls back to a readable label rather than an empty card', () => {
    const card = cardHeading('goal_question', {}, null, 'ka');

    expect(card.title).toBe('შენი პასუხი სჭირდება');
  });
});
