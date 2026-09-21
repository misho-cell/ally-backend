/**
 * Row 220 — counting the introductions that leave as ordinary questions.
 *
 * `ask_contact` files a message as a question: no `introduction_requests` row,
 * so the mediator is never shown accept/decline, never asked HOW (row 223's
 * `intro_channel`), and nothing records that a connection was even attempted.
 * On 20 September both tool descriptions were rewritten to say which tool is
 * which, and THIS counter shipped with them so the next decision would rest on
 * a reading rather than on whether the sentences felt persuasive.
 *
 * THE FIRST READING, 21 September, and it says two things at once.
 *
 * Over the whole life of `task_asks` — 150 rows — the counter as first written
 * matched 13. Reading all 150 by hand found 17. The four it could not see:
 *
 *   2674  connector  "Netai Test 2 asks you to meet Netai Test 1, who would
 *   3103  connector   like to get in touch with you."
 *   3235  connector
 *   3202  chat       „იცნობ კარგ კლოუნს ღონისძიებისთვის? თუ კი, გამომიგზავნე
 *                     მისი საკონტაქტო." — account 160584, a real person, a
 *                     real contact, asking outright for a third person's
 *                     details. No request, no channel, no record.
 *
 * So the counter under-counted, and it under-counted in the direction that
 * matters: the wordings it missed are the ones that hand over a stranger's
 * contact rather than merely ask for a name. Three of the four came through
 * the CONNECTOR, where until now this function was never called at all.
 *
 * IT COUNTS AND DOES NOT REROUTE, and that is deliberate. Deciding from a text
 * pattern that somebody meant an introduction is the kind of inference that
 * goes wrong quietly, and by the time this runs the message has already gone.
 * A false positive costs one log line; a false reroute would cost a message
 * that never arrives. Widening it is therefore cheap and narrowing it is not.
 *
 * ONE KNOWN THEORETICAL FALSE POSITIVE, stated rather than hidden: Georgian
 * „გაცნობებთ" (we will inform you) contains „გაცნობ". It has never occurred —
 * 0 of 150 — so it is not worth a lookbehind that would be harder to read than
 * the thing it guards.
 */

/**
 * The wordings observed in production, not a guess at how people might write.
 * Every alternative below is either in the original 13 or in the four the
 * first reading added.
 */
export const INTRODUCTION_SHAPED =
  /introduce|introduction|put (?:me|us) in touch|connect me\b|get in touch with|asks? you to meet|wants? to meet you|would like to meet you|(?:share|send me) (?:their|his|her) (?:contact|number|details)|(?:their|his|her) contact details|გააცნო|გაცნობ|გამაცნო|დამაკავშირ|საკონტაქტო|(?:მისი|მათი) (?:ნომერ|კონტაქტ)|познаком|свести (?:меня|нас)|(?:его|е[её]|их) (?:контакт|номер)|presenta(?:r|me)|ponerme en contacto|su (?:contacto|n[uú]mero)/i;

/** Which surface sent it. The connector has no thread and no run. */
export type AskSurface = 'chat' | 'connector';

export interface AskOrigin {
  readonly surface: AskSurface;
  readonly taskId: number;
  readonly runId?: string;
  readonly threadId?: number;
}

/**
 * Writes one line when an introduction-shaped question goes out through
 * `ask_contact`. Returns nothing, so nothing downstream can branch on it by
 * accident.
 */
export function noteIntroductionSentAsAQuestion(origin: AskOrigin, question: string): void {
  if (!INTRODUCTION_SHAPED.test(question)) return;
  // eslint-disable-next-line no-console
  console.log(
    `[intro-as-ask] ${origin.surface} run ${origin.runId ?? '-'} thread ${origin.threadId ?? '-'} ` +
      `task ${origin.taskId}: an introduction-shaped question went out through ask_contact — ` +
      `"${question.slice(0, 160)}"`,
  );
}
