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

/**
 * The master test run's 45679 (conv 44096): the question went to Elene, and
 * the reply quoted it and ended „ამ ჩატიდან შეტყობინებას ვერ ვაგზავნი" („I
 * cannot send a message from this chat"). A run that really sent a question
 * must not say it cannot send.
 */
const CANT_SEND_RE =
  /(ვერ\s+(?:ვაგზავნი|გავაგზავნე|გავუგზავნი|ვუგზავნი|გავგზავნი)|can'?t send|cannot send|unable to send|could ?n[o']t send)/iu;

export function claimsItCannotSend(text: string): boolean {
  return CANT_SEND_RE.test(text);
}
