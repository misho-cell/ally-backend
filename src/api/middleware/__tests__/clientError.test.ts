/**
 * 15 September. Found while checking whether the TESTER could actually write
 * into the handoff box, instead of reading four hours of silence as „no
 * reply".
 *
 * The admin page was double-encoding its JSON, so the body arrived as a JSON
 * STRING rather than an object. express's body parser rejects that before any
 * route runs, and the central handler answered „Internal server error", 500.
 *
 * Reproduced against production before the fix: the exact shape the page was
 * sending returned HTTP 500. That is a lie in the expensive direction — it
 * says the server broke when the request never reached it, so whoever is
 * debugging looks at the wrong side of the wire. Every route in the product
 * gave that answer, not only the handoff one.
 */
import { clientErrorReply, HttpError } from '../clientError';

function parserError(type: string, status: number): HttpError {
  // The shape body-parser actually throws.
  const err = new Error('parse failed') as HttpError;
  err.type = type;
  err.status = status;
  err.statusCode = status;
  return err;
}

describe('whose fault the request was', () => {
  it('calls a double-encoded body the client’s 400, and says which', () => {
    const reply = clientErrorReply(parserError('entity.parse.failed', 400));

    expect(reply).toEqual({
      status: 400,
      error: 'Malformed request body: expected JSON',
      type: 'entity.parse.failed',
    });
  });

  it('keeps the status the parser chose rather than flattening it', () => {
    // A body over the limit is 413, not 400 and not 500.
    expect(clientErrorReply(parserError('entity.too.large', 413))?.status).toBe(413);
    expect(clientErrorReply(parserError('entity.too.large', 413))?.error).toBe(
      'Request body too large',
    );
  });

  it('answers a client error it has no wording for without inventing one', () => {
    const reply = clientErrorReply(parserError('something.new', 400));

    expect(reply?.status).toBe(400);
    expect(reply?.error).toBe('Bad request');
    // The tag still reaches the log line, so a new kind is visible the first
    // time it happens rather than after somebody notices a pattern.
    expect(reply?.type).toBe('something.new');
  });

  it('leaves a real server failure alone — that 500 is honest', () => {
    expect(clientErrorReply(new Error('a genuine bug with no status'))).toBeNull();
  });

  it('does not let a 5xx dress itself up as the caller’s mistake', () => {
    const err = new Error('upstream died') as HttpError;
    err.status = 502;
    expect(clientErrorReply(err)).toBeNull();
  });

  it('is not fooled by a non-error', () => {
    expect(clientErrorReply(null)).toBeNull();
    expect(clientErrorReply(undefined)).toBeNull();
    expect(clientErrorReply('a string')).toBeNull();
  });
});
