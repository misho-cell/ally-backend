/**
 * #2115 (tester 43066, convs 41583/41584): the owner wrote „ჰკითხე მარის…"
 * („ask Mari…") and, the question sent, the reply read „მარი ტესტიძეს
 * ჰკითხე…" — the owner's own command handed back to him, where the news is
 * „ვკითხე" („I asked"). Applied only to a run that really sent a question,
 * and never to a sentence that speaks to the owner about asking himself
 * („შენ თვითონ ჰკითხე", „შეგიძლია ჰკითხო").
 */
const OWNER_ADDRESSED_RE = /შენ|თვითონ|შეგიძლია|თავად/u;
const ECHOED_COMMAND_RE = /(^|[^\p{L}])ჰკითხე(?!\p{L})/gu;
const SENTENCE_RE = /[^.!?\n]+[.!?]?|\n/gu;

export function askedNotAsking(text: string): string {
  return (text.match(SENTENCE_RE) ?? [text])
    .map((sentence) =>
      OWNER_ADDRESSED_RE.test(sentence)
        ? sentence
        : sentence.replace(ECHOED_COMMAND_RE, '$1ვკითხე'),
    )
    .join('');
}
