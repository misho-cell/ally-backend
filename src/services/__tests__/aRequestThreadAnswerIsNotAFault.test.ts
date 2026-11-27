/**
 * Alerts 892 and 893 (27 Nov): a member answered two incoming introduction
 * requests in their own words („let my colleague ask", „tell them I need a
 * reason"). The instruction-unsent guard read each line as an order to ask a
 * contact, nudged the model to send, and — since the server may not write an
 * ask in a request thread — told the member „it did not go out; our fault".
 * In a request thread the guard does not run.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { serverMayWriteTheAsk } from '../instructedAsk';

describe('an answer in a request thread is not an unsent instruction', () => {
  it('the server writes no ask in a request thread', () => {
    expect(serverMayWriteTheAsk('request_thread')).toBe(false);
    expect(serverMayWriteTheAsk(undefined)).toBe(true);
  });

  it('is wired: the guard needs a thread where the server may write the ask', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const start = chat.indexOf('const instructionUnsent =');
    const guard = chat.slice(start, chat.indexOf('if (instructionUnsent) {', start));
    expect(guard).toContain('serverMayWriteTheAsk(runModes.get(runId)) &&');
  });
});
