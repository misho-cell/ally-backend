// A run must end on an answer, not an announcement. These are the tails the
// battery kept catching as "half-finished narration marked final" (thread 5942
// + four cases on a second account): the model closes its turn with "now let's
// see…" and no tool call, so the run completes normally with a cliffhanger.
const CLIFFHANGER_TAIL_RE =
  /(?:ვნახოთ|ვნახავ|შევამოწმებ|გადავამოწმებ|მოვძებნი|ვამოწმებ|ვეძებ|ერთი წუთით|ერთი წამით|let me (?:check|look|see|search)|i'?ll (?:check|look|search)|checking|one moment)[^?]{0,60}$/i;

// A long final is a real answer even if it mentions next steps; only short
// finals can BE the cliffhanger.
const MAX_CLIFFHANGER_FINAL_CHARS = 400;

export function isCliffhangerReply(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_CLIFFHANGER_FINAL_CHARS) return false;
  if (/[?？]\s*$/.test(trimmed)) return false; // a question to the user is a valid ending
  return CLIFFHANGER_TAIL_RE.test(trimmed.slice(-160));
}

export const CLIFFHANGER_NUDGE =
  '(სისტემური შენიშვნა: მოკლედ აცნობე მომხმარებელს სად ხარ და რა გაქვს უკვე ნაპოვნი. ' +
  'თუ საქმე დაუსრულებელია და წინსვლა შეგიძლია — განაგრძე ახლავე: გამოიძახე საჭირო ხელსაწყო. ' +
  'თუ საქმე დასრულდა — ჩამოაყალიბე საბოლოო პასუხი; რაც ვერ მოიძებნა, პირდაპირ თქვი.)';

// The final message claiming NOTHING was found while a tool round returned
// results (battery case 8: steps named 23 people, the final said none exist).
// Only a short final can be a blanket not-found claim — a long answer that
// merely says "couldn't find MORE" must not trigger.
const NOT_FOUND_CLAIM_RE =
  /ვერ (?:ვიპოვე|მოიძებნა|ვნახე|იძებნება)|ვერაფერი (?:ვიპოვე|მოიძებნა)|არ (?:მოიძებნა|ჩანს შედეგები)|couldn'?t find|could not find|no (?:results|matches|one) (?:found|matched)|nothing (?:found|matched)/i;
const MAX_NOT_FOUND_CLAIM_CHARS = 600;

export function claimsNothingFound(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_NOT_FOUND_CLAIM_CHARS) return false;
  return NOT_FOUND_CLAIM_RE.test(trimmed);
}
