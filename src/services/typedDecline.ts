/**
 * 3433 (QA-026, 8 Oct, fresh pairs): a helper's typed no was stored as an
 * ANSWER. „აზრზე არ ვარ" (owner 180219) and „არა, ვერ მოვახერხებ, სხვას
 * ჰკითხოს." (owner 180223) left the ask answered; only the decline button
 * recorded a decline. The asker was told politely either way, but the ask's
 * state, and everything that counts declines, was wrong.
 *
 * A short line that says „I don't know / I can't" and gives nothing else is a
 * decline. A line with a number, a „but", or anything long is an answer that
 * may carry something, and stays one.
 */
const TYPED_DECLINE_MAX_CHARS = 100;

const REFUSAL_RE = new RegExp(
  [
    'აზრზე\\s+არ\\s+ვარ',
    'წარმოდგენა\\s+არ\\s+მაქვს',
    'არ\\s+ვიცნობ',
    'არ\\s+ვიცი',
    'ვერ\\s+დაგეხმარ',
    'ვერ\\s+მოვახერხებ',
    'ვერ\\s+გეტყვი',
    'ვერავის\\s+(?:ვიცნობ|გირჩევ|გეტყვი)',
    'არავინ\\s+(?:მყავს|ვიცი|მახსენდება)',
    'no\\s+idea',
    "(?:don['’]?t|do\\s+not)\\s+know",
    "can['’]?t\\s+help",
    'cannot\\s+help',
    'не\\s+знаю',
    'понятия\\s+не\\s+имею',
    'не\\s+смогу',
    'не\\s+могу\\s+помочь',
    'no\\s+sé',
    'no\\s+(?:lo\\s+)?conozco',
    'no\\s+puedo\\s+ayudar',
  ].join('|'),
  'iu',
);

/** Something in the line that may be the help after all. */
const CARRIES_SOMETHING_RE = /\d|მაგრამ|თუმცა|\bbut\b|\bно\b|\bpero\b/iu;

export function isTypedDecline(message: string): boolean {
  const said = message.trim();
  if (said.length === 0 || said.length > TYPED_DECLINE_MAX_CHARS) return false;
  return REFUSAL_RE.test(said) && !CARRIES_SOMETHING_RE.test(said);
}
