jest.mock('../../../db/postgres/client', () => ({
  query: jest.fn(),
  __esModule: true,
  default: { end: jest.fn() },
}));

import { waitingRequestPayload } from '../requests.routes';
import type { PendingRequest } from '../../../services/introduction.service';

const UUID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

function pending(over: Partial<PendingRequest> = {}): PendingRequest {
  return {
    id: 1123,
    request_ref: UUID,
    target_name: 'Netai Test 4',
    message: 'can you introduce us',
    requester_name: 'Gio',
    requester_user_id: 963,
    created_at: '2026-09-21T10:00:00Z',
    direct: false,
    ...over,
  };
}

/**
 * GET /requests — the founder's ruling of 21 September, one letter: „c".
 *
 * The problem was never acting on a request; POST /requests/:ref/:action has
 * worked for a while. The problem was that NOTHING would tell you a ref. The
 * seat's phrase for it: a postbox where letters arrive, you hear about one
 * when the postman mentions it, and you cannot look inside.
 */
describe('what a waiting request hands out', () => {
  /**
   * THE WHOLE POINT. check_my_inbox returns „req_1123"; this route must return
   * the UUID, because that is what the POST takes. The two were never the same
   * identifier and a ref from the inbox gets a 400 — which is the trap this
   * route exists to keep people out of.
   */
  it('gives the UUID the POST takes, never the inbox’s req_<id>', () => {
    const out = waitingRequestPayload(pending());

    expect(out.request_ref).toBe(UUID);
    expect(String(out.request_ref)).not.toMatch(/^req_/);
    expect(String(out.request_ref)).not.toContain('1123');
  });

  it('scrubs the message, because a new surface is not an exemption', () => {
    const out = waitingRequestPayload(pending({ message: 'call me on +995 555 12 34 56' }));

    expect(String(out.message)).toContain('[hidden]');
    expect(String(out.message)).not.toContain('555');
  });

  it('keeps a null message null rather than inventing an empty one', () => {
    expect(waitingRequestPayload(pending({ message: null })).message).toBeNull();
  });

  /**
   * ALWAYS PRESENT NOW, TRUE OR FALSE, AND THIS TEST CHANGED WITH IT.
   *
   * It used to be present only when true, read from a hardcoded Set, and the
   * argument was sound: a Set lookup with no I/O has no failure mode, so
   * absence could not mean „unchecked". The comment beside it said what would
   * have to change if the check ever grew a query — „an explicit true/false".
   *
   * It grew one on 23 September, when the tester got a route to create their
   * own seats: a Set in source cannot grow at runtime, and it was costing a
   * commit per batch, three batches in three hours. The answer is the table
   * the creation route writes, read in the SAME query as the row it describes,
   * so it shares that read's fate — a failure is an error, never a false
   * „not fictional".
   *
   * The value therefore comes off the row rather than being computed here, and
   * a deleted account with no id at all is FALSE rather than absent: the
   * database answers „no such seat", which is a real answer.
   */
  it('marks a drill, and says so either way about a real person', () => {
    const drill = waitingRequestPayload(pending({ requester_is_a_test_seat: true }));
    expect(drill.counterpart_is_a_fictional_test_account).toBe(true);

    const real = waitingRequestPayload(pending({ requester_is_a_test_seat: false }));
    expect(real.counterpart_is_a_fictional_test_account).toBe(false);
  });

  it('carries who is asking and who they want, so the row can be read at all', () => {
    const out = waitingRequestPayload(pending());
    expect(out.from).toBe('Gio');
    expect(out.wants_to_meet).toBe('Netai Test 4');
    expect(out.direct).toBe(false);
  });
});
