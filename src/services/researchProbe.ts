import { query } from '../db/postgres/client';
import { researchCounts, researchEveryLevel } from './fullResearch.service';
import { nameKey } from './researchBridges';

/**
 * Misho, 17 Nov: „make it measurably better". The tester's cases are run again
 * through the full research — nothing written to the conversation, nobody
 * woken — and for each person the tester says should be found, whether the
 * research found them. Only yes or no leaves this, with the log line's counts:
 * never another name from the owner's network.
 */

const OWNER_READ_TIMEOUT_MS = 3_000;
export const MAX_EXPECTED = 10;
const MAX_TEXT_CHARS = 300;

export interface ProbeCase {
  readonly userId: number;
  /** One of the owner's own conversations: the searches are charged and logged there. */
  readonly threadId: number;
  readonly words: string;
  readonly ownerLine: string;
  /** The people the research should find, as the tester names them. */
  readonly expected: readonly string[];
}

export enum ProbeOutcome {
  BadInput = 'bad_input',
  NotTheOwnersThread = 'not_the_owners_thread',
  Ran = 'ran',
}

export interface ProbeResult {
  readonly outcome: ProbeOutcome;
  readonly found?: Readonly<Record<string, boolean>>;
  readonly counts?: string;
}

/** A case is usable when every field is there and short. */
export function probeCaseFrom(body: unknown): ProbeCase | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const text = (v: unknown): string =>
    typeof v === 'string' && v.trim() !== '' && v.length <= MAX_TEXT_CHARS ? v.trim() : '';
  const expected = Array.isArray(b['expected']) ? b['expected'].map(text) : [];
  const userId = Number(b['user_id']);
  const threadId = Number(b['thread_id']);
  const words = text(b['words']);
  const ownerLine = text(b['owner_line']);
  const usable =
    Number.isInteger(userId) &&
    userId > 0 &&
    Number.isInteger(threadId) &&
    threadId > 0 &&
    words !== '' &&
    ownerLine !== '' &&
    expected.length > 0 &&
    expected.length <= MAX_EXPECTED &&
    expected.every((e) => e !== '');
  return usable ? { userId, threadId, words, ownerLine, expected } : null;
}

/** Was each expected person anywhere in the findings, in either alphabet? */
export function whoWasFound(
  findings: unknown,
  expected: readonly string[],
): Record<string, boolean> {
  const text = nameKey(JSON.stringify(findings));
  return Object.fromEntries(expected.map((name) => [name, text.includes(nameKey(name))]));
}

async function ownsThread(userId: number, threadId: number): Promise<boolean> {
  const result = await query<{ owns: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM threads WHERE id = $1 AND user_id = $2) AS owns',
    [threadId, userId],
    OWNER_READ_TIMEOUT_MS,
  );
  return result.rows[0]?.owns === true;
}

/**
 * One case through the full research; the answer is who was found, nothing
 * else. `checkOnly` answers whether the case can run, without running it.
 */
export async function probeResearch(
  probe: ProbeCase | null,
  options: { readonly checkOnly?: boolean } = {},
): Promise<ProbeResult> {
  if (probe === null) return { outcome: ProbeOutcome.BadInput };
  if (!(await ownsThread(probe.userId, probe.threadId))) {
    return { outcome: ProbeOutcome.NotTheOwnersThread };
  }
  if (options.checkOnly === true) return { outcome: ProbeOutcome.Ran };
  const { findings } = await researchEveryLevel({
    userId: String(probe.userId),
    threadId: probe.threadId,
    taskId: 0,
    words: probe.words,
    ownerLine: probe.ownerLine,
    withheld: new Set(),
    askedAt: new Date(),
  });
  return {
    outcome: ProbeOutcome.Ran,
    found: whoWasFound(findings, probe.expected),
    counts: researchCounts(findings),
  };
}
