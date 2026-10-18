import { RunLanguage } from './runLanguage';

/**
 * #5149 (the founder's yes, box 66994; Giorgi G-047, G-065): Netai never
 * writes to a person — it writes to the person's assistant. After a run sends
 * its questions the owner reads one agreed line: „ახლა ვწერ ასისტენტებს:
 * <names>". The model was told to write it and did not: the tester's 58910 and
 * 58911 (18 Oct) both read „გიორგი კაპანაძეს მივწერე, …" — to the person, and
 * no agreed line. So the server says it: the sentence that claims writing to
 * someone asked in this run gives way to the line, and the rest stays.
 */
export const ASSISTANTS_SENT_LINE: Readonly<
  Partial<Record<RunLanguage, (names: string) => string>>
> = {
  ka: (names) => `ახლა ვწერ ასისტენტებს: ${names}.`,
  en: (names) => `Writing to the assistants now: ${names}.`,
};

/** Sentences with the space after each kept, and line breaks as pieces of their own. */
const SENTENCE_RE = /[^.!?…\n]+[.!?…]*\s*|\n+/gu;
const TRAILING_SPACE_RE = /\s*$/u;
const SEND_VERB_RE: Readonly<Partial<Record<RunLanguage, RegExp>>> = {
  ka: /მივწერე|მივწერ|ვწერ|ვკითხე|ვეკითხები|გავუგზავნე|ვუგზავნი|მივმართე/u,
  en: /\b(?:wrote|writing|written|asked|sent|messaged|reached out)\b/iu,
};
const NAMES_AN_ASSISTANT_RE = /ასისტენტ|assistant/iu;
/** A name is matched by the start of its first word, so any case ending still matches. */
const NAME_STEM_CHARS = 4;
const LEADING_MARKS_RE = /^[^\p{L}]+/u;

function nameStem(name: string): string {
  const first = name.replace(LEADING_MARKS_RE, '').split(/\s+/u)[0] ?? '';
  return first.slice(0, NAME_STEM_CHARS).toLowerCase();
}

function claimsWritingTo(sentence: string, stems: readonly string[], verb: RegExp): boolean {
  const lower = sentence.toLowerCase();
  return (
    verb.test(sentence) &&
    !NAMES_AN_ASSISTANT_RE.test(sentence) &&
    stems.some((stem) => stem !== '' && lower.includes(stem))
  );
}

/** The reply with the agreed line in place of „I wrote to <name>"; unchanged in other languages. */
export function withAssistantsSentLine(
  reply: string,
  askedNames: readonly string[],
  language: RunLanguage,
): string {
  const line = ASSISTANTS_SENT_LINE[language];
  const verb = SEND_VERB_RE[language];
  const names = [...new Set(askedNames.map((n) => n.trim()).filter((n) => n !== ''))];
  if (line === undefined || verb === undefined || names.length === 0) return reply;
  const sentLine = line(names.join(', '));
  if (reply.includes(sentLine)) return reply;
  const stems = names.map(nameStem);
  let placed = false;
  const kept = (reply.match(SENTENCE_RE) ?? [reply]).map((sentence) => {
    if (!claimsWritingTo(sentence, stems, verb)) return sentence;
    if (placed) return '';
    placed = true;
    return `${sentLine}${TRAILING_SPACE_RE.exec(sentence)?.[0] ?? ''}`;
  });
  const text = kept
    .join('')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
  if (placed) return text;
  if (NAMES_AN_ASSISTANT_RE.test(reply)) return reply;
  return text === '' ? sentLine : `${text}\n\n${sentLine}`;
}
