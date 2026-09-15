/**
 * Ticket 19 G7 — the admin thread read shows what a run said, not what it did.
 *
 * Thread 15346, inside eight minutes: „the second circle is empty", then „the
 * second circle shows craftsmen Ketevan knows", then „both circles are empty".
 * Three step captions, three different claims, and no way to tell which was
 * true — because a step caption is written BEFORE the call. It says what the
 * run intends, and it was being read as a record of what happened.
 *
 * These tests are about the two things the record must not become: a second
 * copy of what people wrote to each other, and a place a full phone number
 * ends up (D149).
 */
import { redactPhones, resultCountOf, summariseArgs } from '../toolCallLog.service';

describe('Ticket 19 G7 — summarising a tool call for the admin', () => {
  describe('phones (D149)', () => {
    it('keeps only the last four digits', () => {
      expect(redactPhones('995599123456')).toBe('…3456');
      expect(redactPhones('+995 599 12 34 56')).toBe('…3456');
    });

    it('redacts a phone wherever it appears in the line', () => {
      const out = summariseArgs({ phone: '995599123456', task_id: 2872 });
      expect(out).toContain('…3456');
      expect(out).not.toContain('995599123456');
      expect(out).toContain('task_id=2872');
    });

    it('leaves a short number that is not a phone alone', () => {
      expect(redactPhones('2872')).toBe('2872');
    });
  });

  describe('what is never written down', () => {
    it.each(['answer_text', 'question', 'message', 'brief', 'note', 'text'])(
      'records the length of %s and not its words',
      (key) => {
        const secret = 'ნინია გეკითხება, შეგიძლია შეხვდე ერეკლეს';
        const out = summariseArgs({ [key]: secret });
        expect(out).not.toContain('ნინია');
        expect(out).toBe(`${key}=<${secret.length} chars>`);
      },
    );

    it('still records the arguments that answer the question being asked', () => {
      expect(summariseArgs({ tag_query: 'ვეტერინარი' })).toBe('tag_query=ვეტერინარი');
    });
  });

  describe('one line, however large the argument', () => {
    it('truncates rather than storing a whole page', () => {
      const out = summariseArgs({ url: `https://example.com/${'x'.repeat(5000)}` });
      expect(out.length).toBeLessThanOrEqual(301);
      expect(out.endsWith('…')).toBe(true);
    });

    it('survives an argument that is not a string', () => {
      expect(summariseArgs({ ids: [1, 2, 3], ok: true, missing: null })).toBe(
        'ids=[1,2,3] ok=true missing=null',
      );
    });
  });

  describe('how much came back', () => {
    it("uses the tool's own count when it has one", () => {
      expect(resultCountOf({ count: 0, results: [] })).toBe(0);
      expect(resultCountOf({ count: 7 })).toBe(7);
    });

    it('falls back to the length of the first list, which is what a search returns', () => {
      expect(resultCountOf({ results: ['a', 'b'] })).toBe(2);
      expect(resultCountOf({ contacts: [] })).toBe(0);
    });

    it('says nothing rather than guessing when there is no count at all', () => {
      expect(resultCountOf({ sent: true })).toBeNull();
      expect(resultCountOf('ok')).toBeNull();
      expect(resultCountOf(null)).toBeNull();
    });

    it('distinguishes an empty result from a missing one — the 15346 question', () => {
      expect(resultCountOf({ count: 0 })).toBe(0);
      expect(resultCountOf({ count: 0 })).not.toBeNull();
    });
  });
});
