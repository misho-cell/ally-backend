/**
 * The tester's 47325 (F16, goal 22290, 19:24Z): a reply the server started
 * opened „permission_granted ჯერ არ არის ამ დავალებაზე, ოუნერს ჯერ არ
 * დაუმტკიცებია გეგმა…" and went on „ოუნერ y14, ველოდები შენს დასტურს" — the
 * model's own working words, field names and all, read by the owner.
 *
 * A sentence that carries an internal identifier (a snake_case word such as
 * permission_granted or set_task_wake, outside a link or an email) or the model's
 * transliterated „owner" is dropped from the reply. Nothing is dropped when
 * that would leave the reply empty.
 */
const URL_RE = /\bhttps?:\/\/\S+/giu;
const EMAIL_RE = /\S+@\S+/gu;
const INTERNAL_WORD_RE = /\b[a-z]+(?:_[a-z0-9]+)+\b|ოუნერ/u;
const SENTENCE_RE = /[^.!?\n]+[.!?]*[ \t]*\n*/gu;

function carriesInternalWord(sentence: string): boolean {
  return INTERNAL_WORD_RE.test(sentence.replace(URL_RE, '').replace(EMAIL_RE, ''));
}

/** The reply without the sentences that speak in internal words; unchanged when none does. */
export function withoutInternalText(reply: string): string {
  if (!carriesInternalWord(reply)) return reply;
  const kept = (reply.match(SENTENCE_RE) ?? []).filter((s) => !carriesInternalWord(s));
  const out = kept.join('').trim();
  return out === '' ? reply : out;
}
