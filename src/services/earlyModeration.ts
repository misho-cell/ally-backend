import { ModerationVerdict } from './moderation.service';

/**
 * #8524 (tester 82932, threads 80198-80200): after the model, the guards and
 * the officeholder gate ran first and the reply check after them, one after the
 * other — about a second before the reply was saved. The check now starts on
 * the model's text beside the guards. When the guards hand back that same text,
 * its verdict stands; when they changed it, the changed text is checked, as
 * before. The text checked is always the text shown (D217).
 */
export interface EarlyVerdict {
  readonly text: string;
  readonly verdict: Promise<ModerationVerdict>;
}

type Moderate = (text: string) => Promise<ModerationVerdict>;

/** Starts the check now; a failure is handled where the verdict is awaited. */
export function startEarlyModeration(text: string, moderate: Moderate): EarlyVerdict {
  const verdict = moderate(text);
  verdict.catch(() => undefined);
  return { text, verdict };
}

/** The verdict for the text about to be shown: the early one when it is the same text. */
export function verdictForShown(
  shown: string,
  early: EarlyVerdict | null,
  moderate: Moderate,
): Promise<ModerationVerdict> {
  return early !== null && early.text === shown ? early.verdict : moderate(shown);
}
