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
