import { RunLanguage } from './runLanguage';

/**
 * Misho, 29 Oct (Giorgi's thread 74052, „…ვერ გაიგზავნა ჩვენს მხარეს შეფერხების
 * გამო"): when the server stops a run, the model told the member of „a delay on
 * our side" — a fault it cannot name, nothing they can act on. The sentence is
 * replaced with one true line: we are looking at it and will write. The run
 * watch (runAlerts.service) finds the replacement line, so the case still
 * reaches the code session.
 */
export const CHECKING_LINE: Readonly<Record<RunLanguage, string>> = {
  ka: 'ამას ვამოწმებ და მალე მოგწერ.',
  en: 'I am looking into this and will write to you shortly.',
  ru: 'Я проверяю это и скоро напишу.',
  es: 'Lo estoy revisando y te escribo pronto.',
};

const OUR_SIDE_RE =
  /ჩვენს მხარეს|შეფერხებ|ტექნიკურ(ი|მა)? (ხარვეზ|შეცდომ|პრობლემ)|on our side|something went wrong|technical (issue|problem|error)|с нашей стороны|техническ|por nuestra parte|problema técnico/iu;
const SENTENCE_SPLIT_KEEP_RE = /((?<=[.!?…])\s+|\n)/u;

/** Pure: each sentence blaming our side becomes the checking line, said once. */
export function withoutOurSideApology(text: string, language: RunLanguage): string {
  if (!OUR_SIDE_RE.test(text)) return text;
  const parts = text.split(SENTENCE_SPLIT_KEEP_RE);
  let said = false;
  let out = '';
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i];
    const between = parts[i + 1] ?? '';
    if (!OUR_SIDE_RE.test(sentence)) {
      out += sentence + between;
      continue;
    }
    if (said) continue;
    said = true;
    out += CHECKING_LINE[language] + between;
  }
  return out.trim();
}
