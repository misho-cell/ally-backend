/**
 * 4490 (tester box 51481, threads 49281 and 49284, 2 of 2): „სად მუშაობს
 * ბახვა?" was answered with the job and then „შევინახე: ბახვა, სამუშაო
 * ადგილი: „საცდელი ლოჯისტიკა"" — no save tool ran. A plain question saves
 * nothing, so a sentence saying „I saved" under it is false and is taken out;
 * the answer itself stays. Only the first-person verbs: „შენახულია" (it is
 * saved) can be a true account of an earlier save.
 */
const SAID_SAVED_RE =
  /(?<![\p{L}\p{M}])(?:დავიმახსოვრე|შევინახე|ჩავიწერე|I(?:'ve| have)? saved|I(?:'ve| have)? noted|сохранил[аи]?|запомнил[аи]?|guardé)(?![\p{L}\p{M}])/iu;
const SAVING_TOOL_RE = /^(?:save_|correct_|remember_|add_|set_user_|update_profile)/u;
const QUESTION_RE = /[?？]\s*$/u;
/** A sentence ends at . ! ? or a line break; the mark stays with its sentence. */
const SENTENCE_RE = /[^.!?\n]+[.!?]*\s*|\n+/gu;

function ownerAskedOnly(ownerLine: string): boolean {
  return QUESTION_RE.test(ownerLine.trim());
}

/** The reply without the „I saved" sentences, when the owner only asked and nothing was saved. */
export function withoutSavedClaimOnAQuestion(
  reply: string,
  ownerLine: string,
  toolNamesUsed: readonly string[],
): string {
  if (!ownerAskedOnly(ownerLine) || !SAID_SAVED_RE.test(reply)) return reply;
  if (toolNamesUsed.some((name) => SAVING_TOOL_RE.test(name))) return reply;
  const kept = (reply.match(SENTENCE_RE) ?? [])
    .filter((sentence) => !SAID_SAVED_RE.test(sentence))
    .join('')
    .trim();
  return kept === '' ? reply : kept;
}
