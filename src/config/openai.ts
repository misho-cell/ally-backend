import OpenAI from 'openai';

/**
 * Ticket 20 row 129. The second provider, for the final user-facing answer
 * only — see finalAnswer.service.ts.
 *
 * Unlike config/anthropic.ts this does NOT throw when the key is absent, and
 * the difference is deliberate. Anthropic is load-bearing: with no key the
 * product cannot answer anybody and failing at boot is the honest outcome.
 * OpenAI is behind a flag that is off by default, so a missing key must mean
 * „that feature is not available", not „the server will not start". Every
 * deploy between this code landing and the key being set in Railway has to
 * keep working exactly as before.
 */
let client: OpenAI | null = null;

export function openaiClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  // Built once and reused: the SDK holds a connection pool, and a fresh client
  // per call throws that away.
  client ??= new OpenAI({ apiKey });
  return client;
}

/** Tests and key rotation — the next call rebuilds from the environment. */
export function resetOpenAiClient(): void {
  client = null;
}
