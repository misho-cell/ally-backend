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

/**
 * Ticket 20 row 126 — a task_step run that ends leaving the goal planless.
 *
 * The tester's PR1 run, 16 September. Four of five fresh goals proposed their
 * plan in the run that saved them (row 101). The fifth, goal 3598, did not:
 * ensureGoalForRequest had opened it BEFORE the run started, so create_task
 * was never called and row 101's instruction — which lives in create_task's
 * RESULT — never reached it. That run searched for 107 seconds and answered
 * with no plan; the delayed engine turn then proposed it four seconds later,
 * in a second message.
 *
 * The task-engine section of the prompt ALREADY says „გეგმა ჯერ არ არის.
 * პირველი ნაბიჯი: propose_task_plan-ით შესთავაზე". It said so during that
 * run. This is the lesson G6 and row 117 both wrote down — a sentence in a
 * prompt is not a wall — so the answer is not a better sentence. The run is
 * checked against the goal's actual state and asked once more, with the tools
 * still in its hand.
 *
 * The delayed engine turn stays exactly where it is. It already refuses to
 * fire when a plan exists, so a nudge that works leaves it nothing to do
 * rather than racing it — the same arrangement row 101 chose.
 */
export const MISSING_PLAN_NUDGE =
  '(სისტემური შენიშვნა: ამ მიზანს გეგმა ჯერ არ აქვს, შენი პასუხი კი უკვე დაიწერა. ' +
  'ახლავე გამოიძახე propose_task_plan — რა ჩაითვლება მოგვარებულად, რა გზებით მიდიხარ, ' +
  'ვის ეკითხები (ტელეფონის id ძიების შედეგიდან), ვის არასდროს — და ბოლოს present_choices-ით ' +
  'ორი ღილაკი: „დამტკიცებულია" და „შევცვალოთ". პასუხი აღარ გაიმეორო: მხოლოდ გეგმა და ღილაკები. ' +
  'თუ მფლობელმა თქვა, რომ არავის არ მივწეროთ — people_to_involve ცარიელი რჩება.)';

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
