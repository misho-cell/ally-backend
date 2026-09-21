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
   * Present only when true, for the reason argued when it was added to
   * check_my_inbox: isFictionalTestAccount is a Set lookup on an id already in
   * hand, with no I/O, so it has no failure mode and absence cannot mean
   * „unchecked". A real person's request carries nothing.
   */
  it('marks a drill, and says nothing at all about a real person', () => {
    const drill = waitingRequestPayload(pending({ requester_user_id: 171871 }));
    expect(drill.counterpart_is_a_fictional_test_account).toBe(true);

    const real = waitingRequestPayload(pending({ requester_user_id: 963 }));
    expect(real).not.toHaveProperty('counterpart_is_a_fictional_test_account');

    // A deleted account has no id at all — absent must not read as fictional.
    const gone = waitingRequestPayload(pending({ requester_user_id: null }));
    expect(gone).not.toHaveProperty('counterpart_is_a_fictional_test_account');
  });

  it('carries who is asking and who they want, so the row can be read at all', () => {
    const out = waitingRequestPayload(pending());
    expect(out.from).toBe('Gio');
    expect(out.wants_to_meet).toBe('Netai Test 4');
    expect(out.direct).toBe(false);
  });
});
