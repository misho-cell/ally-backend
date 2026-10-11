import { RunLanguage } from './runLanguage';

/**
 * 4555 (tester box 51778, 0 of 2 after 0119): after „ინტერნეტში წერია, რომ
 * ბახვა „სანიმუშო ბანკში" მუშაობს", the bank was kept only as a mentioned
 * note beside the job the owner stated — and the reply still said „შევინახე:
 * ბახვა, დამსაქმებელი: „სანიმუშო ბანკი" ✓". The save's own result says what
 * happened (kept_as: mentioned_note) and the model ignored it both times. So
 * the sentence that claims the save is replaced by the server's own line.
 *
 * ON by Misho's „ყველა კი" on the morning list, 11 Oct ~06:15 UTC (§128, NIGHT_QUESTIONS BK).
 */
export const MENTIONED_NOTE_LINE_ON = true;

const MENTIONED_LINE: Readonly<Record<RunLanguage, (value: string) => string>> = {
  ka: (value) => `ეს ჩავინიშნე როგორც ნახსენები: „${value}“. შენი ნათქვამი უცვლელად დარჩა.`,
  en: (value) =>
    `I noted this as something mentioned: “${value}”. What you told me stays as it was.`,
  ru: (value) =>
    `Я записал это как упомянутое: «${value}». То, что сказал ты, осталось без изменений.`,
  es: (value) => `Lo anoté como algo mencionado: «${value}». Lo que tú me dijiste sigue igual.`,
};

const SAID_SAVED_RE =
  /(?<![\p{L}\p{M}])(?:შევინახე|დავიმახსოვრე|ჩავიწერე|saved|noted|сохранил[аи]?|запомнил[аи]?|guardé)(?![\p{L}\p{M}])/iu;
/** A sentence ends at . ! ? or a line break; the mark stays with its sentence. */
const SENTENCE_RE = /[^.!?\n]+[.!?]*\s*|\n+/gu;
const VALUE_STEM_CHARS = 5;

function speaksOfValue(sentence: string, value: string): boolean {
  const stem = value.trim().toLowerCase().slice(0, VALUE_STEM_CHARS);
  return stem !== '' && sentence.toLowerCase().includes(stem);
}

/**
 * The reply with each sentence that claims the mentioned value was saved
 * replaced by the server's line, said once. Untouched when nothing claims it.
 */
export function withMentionedNoteLine(
  reply: string,
  mentionedValue: string,
  language: RunLanguage,
  on: boolean = MENTIONED_NOTE_LINE_ON,
): string {
  if (!on || mentionedValue.trim() === '') return reply;
  const line = (MENTIONED_LINE[language] ?? MENTIONED_LINE.ka)(mentionedValue.trim());
  let said = false;
  const sentences = (reply.match(SENTENCE_RE) ?? []).flatMap((sentence) => {
    if (!SAID_SAVED_RE.test(sentence) || !speaksOfValue(sentence, mentionedValue)) {
      return [sentence];
    }
    if (said) return [];
    said = true;
    const trailing = /\s*$/u.exec(sentence)?.[0] ?? '';
    return [`${line}${trailing === '' ? ' ' : trailing}`];
  });
  return said ? sentences.join('').trim() : reply;
}
