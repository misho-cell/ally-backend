import { hasAnyAskBoundary } from './askBoundary.service';

/**
 * #1694, the tester's 69059 (thread 61131): the owner read „✉️ writing to
 * <B>'s assistant…" about a person whose own boundary then stopped the send.
 * The step line is written before any tool runs, so it promised a message that
 * never went, and it named the one person the boundary exists to keep out.
 *
 * So an ask to a person who closed any subject at all gets the plain working
 * line instead of their name. Whether THIS question falls under the boundary
 * takes a model call, too slow for a line meant to appear at once; „has one"
 * is a single read, and the plain line is true either way.
 */
const ASK_TOOL = 'ask_contact';

export interface StepCall {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}

function askedPhone(call: StepCall): string | null {
  if (call.name !== ASK_TOOL) return null;
  const phone = (call.input as { phone?: unknown } | null)?.phone;
  return typeof phone === 'string' && phone.trim() !== '' ? phone : null;
}

/**
 * The ids of the ask steps whose line must not name the person. A failed read
 * keeps the step unnamed: a plain line is never false, a name might be.
 */
export async function askStepsToKeepUnnamed(calls: readonly StepCall[]): Promise<Set<string>> {
  const asks = calls.flatMap((call) => {
    const phone = askedPhone(call);
    return phone === null ? [] : [{ id: call.id, phone }];
  });
  const closed = await Promise.all(
    asks.map(({ phone }) =>
      Promise.resolve()
        .then(() => hasAnyAskBoundary(phone))
        .catch((err: unknown) => {
          // eslint-disable-next-line no-console
          console.warn(
            '[ask-caption] boundary not read, step left unnamed:',
            (err as Error).message,
          );
          return true;
        }),
    ),
  );
  return new Set(asks.filter((_, i) => closed[i]).map(({ id }) => id));
}
