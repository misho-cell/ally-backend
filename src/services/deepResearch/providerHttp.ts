import { ProviderName } from './deepResearch.types';

/** A provider that did not answer, with its HTTP status — never its body, which may echo the request. */
export class ProviderError extends Error {
  constructor(
    readonly provider: ProviderName,
    readonly status: number,
    reason: string,
  ) {
    super(`${provider} did not answer (${status}): ${reason}`);
  }
}

/** The status a call that never reached the provider (a timeout, a refused connection) is reported with. */
const NO_RESPONSE_STATUS = 0;

/** The provider's key, from the environment only. Empty when it is not set. */
export function providerKey(name: string): string {
  return process.env[name]?.trim() ?? '';
}

/** One JSON POST with a timeout. Throws ProviderError on anything but a 2xx JSON answer. */
export async function postJson(
  provider: ProviderName,
  url: string,
  headers: Readonly<Record<string, string>>,
  body: unknown,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new ProviderError(provider, response.status, response.statusText);
    return (await response.json()) as unknown;
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    throw new ProviderError(provider, NO_RESPONSE_STATUS, (err as Error).message);
  } finally {
    clearTimeout(timer);
  }
}

/** A string field of an unknown object, or ''. */
export function stringField(row: unknown, field: string): string {
  if (typeof row !== 'object' || row === null) return '';
  const value = (row as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : '';
}

/** An array field of an unknown object, or []. */
export function arrayField(row: unknown, field: string): unknown[] {
  if (typeof row !== 'object' || row === null) return [];
  const value = (row as Record<string, unknown>)[field];
  return Array.isArray(value) ? value : [];
}
