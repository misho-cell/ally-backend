/**
 * 958 (the tester's 55870 re-run, 12 Oct 23:29Z): small talk took 5.5–6.5 s
 * end to end while the model run itself took 1.6–2.7 s. In the database the
 * owner's stored message and the stored reply were 3.6–4.7 s apart, and the
 * ~2 s around the run was logged nowhere. This line splits it, per answer:
 * from the stored message to the run's start (the thread queue, the route),
 * and from the run's start to the answer handed to the app.
 */
export function runLatencyLine(
  runId: string,
  threadId: number,
  storedAt: number,
  runStartedAt: number,
  answeredAt: number,
): string {
  return (
    `[latency] run ${runId} thread ${threadId}: stored→run ${runStartedAt - storedAt} ms, ` +
    `run→answer ${answeredAt - runStartedAt} ms, total ${answeredAt - storedAt} ms`
  );
}
