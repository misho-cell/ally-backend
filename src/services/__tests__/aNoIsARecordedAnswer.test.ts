import { readFileSync } from 'fs';
import { join } from 'path';

import { declineChoice, isDeclineChoice } from '../askOpening';

/**
 * ROW 274 — the founder's fourth number was „asks: answered, declined, never
 * answered — kept apart", and DECLINED did not exist in the data. Measured on
 * the live base: of 92 answers, about 8 READ as refusals — and „about" was the
 * whole problem, because the only way to count them was to read them and
 * judge.
 *
 * Two options were put to Misho on 26 September:
 *   A — a real decline button
 *   B — the model decides from the words whether an answer was a refusal
 * He chose A.
 */
describe('a refusal exists only when the person said so', () => {
  /**
   * ⚠️ THE BUTTON'S TEXT BEING OURS IS THE WHOLE MECHANISM. The server
   * recognises a decline by comparing strings, never by judging words — and
   * that comparison is the only thing separating option A from option B. The
   * moment it becomes a guess, it IS B.
   */
  it('matches the button exactly, in every language', () => {
    for (const language of ['en', 'ru', 'es', 'ka'] as const) {
      expect(isDeclineChoice(declineChoice(language))).toBe(true);
    }
  });

  /**
   * ⚠️ ALL LANGUAGES, NOT JUST THE THREAD'S. A person's language is decided
   * from the evidence at the time, and there is more evidence later — so the
   * ask can go out in one language and the answer be read in another. Matching
   * only the expected one would drop the refusal of the very reader we were
   * least sure about.
   */
  it('matches a button pressed in a language we did not expect', () => {
    expect(isDeclineChoice(declineChoice('en'))).toBe(true);
    expect(isDeclineChoice(declineChoice('ka'))).toBe(true);
  });

  it('ignores surrounding whitespace, because a client may add it', () => {
    expect(isDeclineChoice(`  ${declineChoice('ka')}  `)).toBe(true);
  });

  /**
   * ⚠️ WORDS THAT MERELY MEAN NO ARE NOT A DECLINE, and that is the decision,
   * not a gap. Under option B „not right now, maybe next week" could be filed
   * as a permanent refusal — a choice made on somebody's behalf. Their words
   * go to the asker as words; only the button makes a record.
   */
  it.each(['no', 'არა', "sorry, I don't know anybody", 'ვერ დაგეხმარები ამ საკითხში', '', '   '])(
    'does not treat %p as pressing the button',
    (said) => {
      expect(isDeclineChoice(said)).toBe(false);
    },
  );
});

describe('what the ask carries, and what the answer records', () => {
  const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
  /**
   * ⚠️ ANCHORED ON THE FUNCTION, then on its statement. Written as „the first
   * `UPDATE task_asks` in the file" this read a different statement entirely —
   * the one that stamps an automatic answer — and failed on code it was never
   * about. Third time this week that a lazy slice has broken a true test.
   */
  const recordAnswer = asks.slice(asks.indexOf('export async function recordAskAnswer'));
  const answerSql = recordAnswer.slice(recordAnswer.indexOf('UPDATE task_asks'));

  /** One button. Saying yes is answering, which they can already do by typing. */
  it('offers the decline with the question itself', () => {
    expect(asks).toContain("await saveThreadMessage(askThreadId, toUserId, 'assistant', opening");
    expect(asks).toContain('declineChoice(language)');
  });

  /**
   * ⚠️ A DECLINE IS STILL `answered`, and this is load-bearing. The asker's
   * question IS resolved and their goal must wake; `task_asks.status` has
   * three values and six readers, and every one of them is right to go on
   * seeing answered. The column is the part they could not see.
   */
  it('leaves the status alone and records the refusal beside it', () => {
    expect(answerSql.slice(0, 2400)).toContain(
      "status = CASE WHEN status = 'sent' THEN 'answered' ELSE status END",
    );
    expect(answerSql.slice(0, 2400)).toContain(
      'declined_at = CASE WHEN $3 THEN COALESCE(declined_at',
    );
  });

  /** $3 is decided in TypeScript by string equality — the SQL judges nothing. */
  it('decides in code, not in the query', () => {
    expect(asks).toContain('isDeclineChoice(safe)');
  });

  /**
   * COALESCE, so a later line in the same round cannot un-decline it: if
   * somebody taps the button and then types a name after all, the name is
   * appended and the asker gets it, and the refusal that WAS said stays said.
   */
  it('cannot be taken back by a later line in the same round', () => {
    expect(answerSql.slice(0, 2400)).toContain('COALESCE(declined_at, NOW())');
  });
});

describe('the number it produces says how young it is', () => {
  const report = readFileSync(join(__dirname, '..', 'pilotOutcomes.service.ts'), 'utf8');

  /**
   * ⚠️ A SMALL NUMBER HERE MUST NOT READ AS „ALMOST NOBODY REFUSES". Every ask
   * answered before the button shipped carries no record either way — not
   * „was not a decline" but „nobody recorded it" — so the start date travels
   * on the same object as the count.
   */
  it('ships the start date beside the count', () => {
    expect(report).toContain('declines_recorded_since: DECLINES_RECORDED_SINCE');
    expect(report).toContain("const DECLINES_RECORDED_SINCE = '2026-09-26'");
  });

  it('no longer claims the number cannot be built', () => {
    expect(report).not.toContain('DECLINE_IS_NOT_RECORDED');
    expect(report).toContain('DECLINE_COUNT_IS_YOUNG');
  });

  /** `cancelled` is the ASKER withdrawing; it is not a thing the recipient did. */
  it('keeps a withdrawn ask out of the recipient’s three columns', () => {
    const sql = report.slice(report.indexOf('AS answered'));
    expect(sql.slice(0, 600)).not.toContain("'cancelled'");
  });
});
