/**
 * Board #386: a goal's run that has nothing to say is not a failure when
 * nobody asked it anything.
 *
 * 2 October, threads 28018 (21:09) and 27886 (19:48): a scheduled check woke
 * each goal, the model looked, found nothing new, set the next check
 * (set_task_wake) and wrote no sentence. That is a complete step. The server
 * still read it as an owner turn that produced nothing: it stored „the reply
 * did not come together, try again" in the owner's conversation and marked it
 * failed. The owner had not written anything, and there was nothing to retry.
 *
 * So a run the SYSTEM started (a wake or an event) that did its work through
 * tools and wrote no text ends quietly: nothing goes into the conversation and
 * the goal keeps its status. A run that called no tool at all and wrote
 * nothing did not do anything, so it is still reported as failed. So is any
 * run the owner started: the owner is waiting for an answer.
 */
interface ContentBlockLike {
  readonly type: string;
}

interface TurnLike {
  readonly role: 'user' | 'assistant';
  readonly content: string | readonly ContentBlockLike[];
}

function callsATool(turn: TurnLike): boolean {
  return (
    turn.role === 'assistant' &&
    typeof turn.content !== 'string' &&
    turn.content.some((block) => block.type === 'tool_use')
  );
}

/**
 * 3 October 07:21Z, thread 26302 (a real owner): a scheduled check answered
 * only with a stage direction, a sentence in brackets about waiting, which
 * the server drops. With no tool call, that counted as „did nothing" and the
 * owner found „the reply did not come together, try again" under a message
 * they never wrote. A system run that answered only in a stage direction had
 * nothing to say, the same as one that set its wake and wrote nothing.
 */
export function endsQuietly(
  ownerAbsent: boolean,
  runTurns: readonly TurnLike[],
  answeredOnlyInStageDirection = false,
): boolean {
  return ownerAbsent && (answeredOnlyInStageDirection || runTurns.some(callsATool));
}
