/**
 * D562 (Tornike, 1 October): a new standing „answer them like this" rule can
 * no longer be made. The tester's 38744 and 38616 (#1123): a helper typed
 * „შეინახე ავტომატური პასუხი: …" and the run replied „შევინახე" over a profile
 * note, which reads as the automatic answer being saved. A line in a tool
 * description either missed it or, worded broadly, stopped English „ask X…"
 * from going out (#1090). So the server recognises the request itself and
 * tells THAT run only.
 */
const AUTOMATIC_ANSWER_RE =
  /ავტომატურ\p{L}*\s+პასუხ|ჩემ(?:ს|ი)\s+მაგივრად\s+უპასუხ|ყოველთვის\s+(?:ასე\s+)?უპასუხ|auto(?:matic|-)?\s*(?:answer|repl)|answer\s+(?:it|them|for\s+me)\s+automatically|respuesta\s+autom|автоответ|автоматическ\p{L}*\s+ответ/iu;

export function asksForAnAutomaticAnswer(message: string): boolean {
  return AUTOMATIC_ANSWER_RE.test(message);
}

export const AUTOMATIC_ANSWER_NOTE =
  '\n\nTHE USER ASKS FOR A STANDING AUTOMATIC ANSWER to questions other people send them. A new ' +
  'one cannot be made any more (D562). Say so plainly in their language — automatic answers ' +
  'are not set up now; when someone asks, the question will come to them. If you save ' +
  'something to their profile, say exactly what you noted; never a bare „saved" („შევინახე"), ' +
  'which reads as the automatic answer being saved.';
