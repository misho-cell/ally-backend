import { randomUUID } from 'crypto';

/**
 * Lika's podcast test (12 Nov, E13): the person asked said yes and wrote what
 * the asker wanted to know — a new tech podcast, on YouTube, recorded online,
 * about forty minutes — and the asker read only „he agreed". An answer's
 * meaning reaches the asker through their goal's run (#1750, D648: nobody's
 * words are quoted to another person), and this request had no goal: it was
 * sent from a conversation the asker was having with somebody else's assistant.
 *
 * So a request with no goal behind it tells the asker in the conversation it
 * was sent from: one run there, which says in its own words what the person
 * wrote. Nothing is quoted, and nothing runs when there is nothing to tell.
 */
export interface AnswerForTheChat {
  readonly requesterUserId: string;
  readonly originThreadId: number | null;
  /** Who answered, as the asker knows them. */
  readonly answeredBy: string;
  readonly accepted: boolean;
  /** What the person wrote, or the assistant's account of it. Model-facing only. */
  readonly answer: string;
}

/** The model-facing event for the asker's conversation. */
export function answerEventBody(input: AnswerForTheChat): string {
  const verdict = input.accepted ? 'დათანხმდა' : 'უარი თქვა';
  return (
    `${input.answeredBy} შენს გაცნობის თხოვნაზე ${verdict} და დაწერა: «${input.answer}». ` +
    'მფლობელს შენი სიტყვებით, ერთ ან ორ ხაზში უთხარი, რა დაწერა — ციტატის გარეშე, ' +
    'ყველა ფაქტი ზუსტად. სხვა არაფერი გააკეთო და არაფერი დაჰპირდე.'
  );
}

/** Runs the asker's own conversation once with the answer; false when nothing ran. */
export async function tellTheAnswerInTheChat(input: AnswerForTheChat): Promise<boolean> {
  if (input.originThreadId === null || input.answer.trim() === '') return false;
  const [{ processChat }, { emitRunComplete }] = await Promise.all([
    import('./chat.service'),
    import('./sse.service'),
  ]);
  const runId = randomUUID();
  const result = await processChat(
    input.requesterUserId,
    input.originThreadId,
    `[მოვლენა] ${answerEventBody(input)}`,
    runId,
  );
  if (result.runFailed === true || result.reply.trim() === '') return false;
  emitRunComplete(input.requesterUserId, input.originThreadId, runId, { reply: result.reply });
  return true;
}
