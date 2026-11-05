import { setPlanDelegated } from './planProgress.service';

/**
 * Autonomy stage 2, K5 (Misho, 5 Nov): „do what's needed / you decide" when the
 * owner approves is a delegation — the approval then covers every step of the
 * plan except the ones it marked ask_owner. The MODEL reads that meaning from
 * the owner's words and says so in `delegated`; the server keeps no word list
 * (#8779) and only stores the flag beside the approval.
 */
export const DELEGATED_FIELD_SCHEMA = {
  type: 'boolean',
  description:
    'true when the owner’s yes also hands the decisions over to you — they said, in any ' +
    'words, to do what is needed or that you decide. Then every step of the plan goes without ' +
    'asking them again, except steps marked ask_owner. false for a plain yes.',
} as const;

/** Store the run's reading; a failure is logged and never undoes the approval. */
export async function recordDelegation(
  userId: string,
  taskId: number,
  delegated: unknown,
): Promise<void> {
  try {
    if (delegated === true) await setPlanDelegated(taskId, userId, true);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[plan-steps] task ${taskId}: delegation not stored:`, (err as Error).message);
  }
}
