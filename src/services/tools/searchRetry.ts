// One paced retry for search tools, shared by the connector handlers and the
// in-app tool dispatch. A transient failure — pool blip, statement-timeout
// edge, or a cold-cache first touch that the attempt itself part-warmed —
// used to surface straight to the model. The connector absorbed those with
// its retry while the SAME call in-app became a user-visible "timeout, come
// back later" (thread 7428). A persistent error still surfaces honestly.
const SEARCH_RETRY_DELAY_MS = 400;

export async function searchWithRetry(run: () => Promise<object>): Promise<object> {
  const first = await run().catch((err) => ({ error: (err as Error).message }) as object);
  if (typeof (first as { error?: unknown }).error !== 'string') return first;
  // eslint-disable-next-line no-console
  console.warn('[search] transient failure — retrying once:', (first as { error: string }).error);
  await new Promise<void>((resolve) => setTimeout(resolve, SEARCH_RETRY_DELAY_MS));
  return run().catch((err) => ({ error: (err as Error).message }) as object);
}
