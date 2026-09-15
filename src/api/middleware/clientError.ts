/**
 * Is this failure the CLIENT's fault, and if so which one?
 *
 * Found on 15 September while checking whether the tester could actually
 * write into the handoff box, rather than reading four hours of silence as
 * „no reply". The admin page was double-encoding its JSON, so the body
 * arrived as a JSON *string* rather than an object. express's body parser
 * rejects that before any route runs, and the central error handler answered
 * „Internal server error", 500.
 *
 * That is a lie in the expensive direction: it says the server broke when the
 * request never reached it, so whoever is debugging looks at the wrong side of
 * the wire. And it was the answer for every route in the product, not only
 * that one.
 *
 * The body parser already decides the right status — 400 for a parse failure,
 * 413 for a body over the limit — so the job here is to stop overwriting it.
 */
export interface HttpError extends Error {
  status?: number;
  statusCode?: number;
  /** express/body-parser's own tag, e.g. 'entity.parse.failed'. */
  type?: string;
}

/**
 * What to say. Named by cause, without echoing the body back — the body is
 * somebody's content and does not belong in an error string or a log line.
 */
const CLIENT_ERROR_TEXT: Record<string, string> = {
  'entity.parse.failed': 'Malformed request body: expected JSON',
  'entity.too.large': 'Request body too large',
  'encoding.unsupported': 'Unsupported content encoding',
  'entity.verify.failed': 'Request body failed verification',
};

const GENERIC_CLIENT_ERROR = 'Bad request';

export interface ClientErrorReply {
  readonly status: number;
  readonly error: string;
  /** The parser's tag, for the log line. Never the body. */
  readonly type: string;
}

/**
 * The reply for a client-caused failure, or null when the fault is ours and
 * the 500 stands. Only 4xx counts: a 5xx carried on an error is still a
 * server failure and must not be dressed up as the caller's mistake.
 */
export function clientErrorReply(error: unknown): ClientErrorReply | null {
  if (typeof error !== 'object' || error === null) return null;
  const err = error as HttpError;
  const status = err.status ?? err.statusCode;
  if (typeof status !== 'number' || status < 400 || status >= 500) return null;
  const type = typeof err.type === 'string' ? err.type : 'unknown';
  return { status, error: CLIENT_ERROR_TEXT[type] ?? GENERIC_CLIENT_ERROR, type };
}
