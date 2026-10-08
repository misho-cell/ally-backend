/**
 * 1688 (A5, D679/D680): two assistants can talk past their owners — the
 * helper asks „which city?", the asker's assistant answers from the goal, the
 * helper asks again, and nobody has typed a word. Without a cap that loops
 * (the Amy/Duplex problem). After two such rounds on one goal with one person,
 * the assistant stops and the owner answers; the owner's own words reset it.
 */
export const A2A_ROUND_CAP = 2;

export interface RoundInput {
  /** The person answered the last ask, so this one is a reply in a conversation. */
  readonly isFollowUp: boolean;
  /** The owner typed something since the last ask to this person. */
  readonly ownerAddedSomething: boolean;
  /** The question is the owner's own line, sent by the server. */
  readonly fromOwnersLine: boolean;
  /** A relay or the evening card: not the asker's assistant talking. */
  readonly sentOnSomeonesWord: boolean;
  /** Rounds stamped on the last ask to this person on this goal. */
  readonly roundsSoFar: number;
}

/** Is this ask the asker's assistant writing again with no person in between? */
export function isAssistantOnlyRound(input: RoundInput): boolean {
  return (
    input.isFollowUp &&
    !input.ownerAddedSomething &&
    !input.fromOwnersLine &&
    !input.sentOnSomeonesWord
  );
}

/** The rounds to stamp on this ask: one more for an assistant-only round, else 0. */
export function roundsAfter(input: RoundInput): number {
  return isAssistantOnlyRound(input) ? input.roundsSoFar + 1 : 0;
}

/** Has the cap been reached, so this round needs the owner instead? */
export function needsTheOwner(input: RoundInput): boolean {
  return isAssistantOnlyRound(input) && input.roundsSoFar >= A2A_ROUND_CAP;
}

/**
 * ⚠️ MODEL-FACING (D44): §108 in docs/ADMIN_WRITE_OPERATIONS.md, NOT YET
 * APPROVED. The tool result the asking model reads when the cap stops a
 * third assistant-only round.
 */
export function ownerMustAnswerNote(toName: string): string {
  return (
    `${toName}-ს ამ მიზანზე უკვე ორჯერ მისწერე ისე, რომ მფლობელს არაფერი დაუწერია — ` +
    'მესამედ თავად აღარ მისწერო. მფლობელს ერთი ხაზით უთხარი, რა უნდა ' +
    `${toName}-ს, და ჰკითხე, რა უპასუხოს. როცა მფლობელი დაწერს, მისი სიტყვებით გაგზავნე.`
  );
}
