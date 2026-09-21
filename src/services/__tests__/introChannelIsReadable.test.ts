jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { getIntroStatusForRequester } from '../introduction.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * The seat's 407 §5b, and it is a privacy fault wearing a naming fault.
 *
 * An hour after mediator 171870 chose `via_mediator` on request 1289 — staying
 * in the middle, no number passed on — the assistant told the owner that
 * person „will connect you directly". The outcome message on the request's own
 * thread had said it correctly; the plan was written in a DIFFERENT thread,
 * where the model had this tool's result and a field called `direct`.
 *
 * It read the obvious way. `direct` meant „nobody is in the middle of the
 * REQUEST". It was taken to mean „the connection will be direct" — the
 * CHANNEL, which is a different fact and is somebody else's decision about
 * their own privacy.
 *
 * `intro_channel` has been written since 20 September and, until now, read by
 * exactly one admin route. The person who most needed it could not see it.
 */
describe('the channel is readable, and cannot be confused with who answered', () => {
  beforeEach(() => jest.clearAllMocks());

  const rowsOf = (over: Record<string, unknown>) => ({
    rows: [
      {
        target_name: 'ნიტა',
        responder_name: 'ლიკა',
        status: 'accepted',
        response: 'კი',
        asked_at: '2026-09-21T10:20:16Z',
        responded_at: '2026-09-21T10:22:50Z',
        answered_by_the_person_themselves: false,
        ...over,
      },
    ],
    rowCount: 1,
  });

  it('asks the database for the channel at all', async () => {
    mockQuery.mockResolvedValue(
      rowsOf({ intro_channel: null, contact_handed_over: null }) as never,
    );
    await getIntroStatusForRequester('963');
    expect(String(mockQuery.mock.calls[0][0])).toContain('ir.intro_channel');
  });

  /** The permission question, answered three ways rather than two. */
  it.each([
    ['direct', true],
    ['via_mediator', false],
  ])('a recorded %s reads as contact_handed_over %s', async (channel, handed) => {
    mockQuery.mockResolvedValue(
      rowsOf({ intro_channel: channel, contact_handed_over: handed }) as never,
    );
    const [row] = await getIntroStatusForRequester('963');
    expect(row.contact_handed_over).toBe(handed);
  });

  /**
   * NULL is not „no". It is „nobody has said" — unanswered, or answered before
   * the channel was ever recorded. On NULL the owner is told neither thing.
   */
  it('keeps „nobody has said" apart from „no"', async () => {
    mockQuery.mockResolvedValue(
      rowsOf({ intro_channel: null, contact_handed_over: null }) as never,
    );
    const [row] = await getIntroStatusForRequester('963');
    expect(row.contact_handed_over).toBeNull();
    expect(row.contact_handed_over).not.toBe(false);
  });

  /** The name that caused it is gone, not merely joined by a better one. */
  it('no longer offers a bare `direct` to be misread', async () => {
    mockQuery.mockResolvedValue(
      rowsOf({ intro_channel: null, contact_handed_over: null }) as never,
    );
    const [row] = await getIntroStatusForRequester('963');
    expect(row).not.toHaveProperty('direct');
    expect(row).toHaveProperty('answered_by_the_person_themselves');
    expect(String(mockQuery.mock.calls[0][0])).not.toContain('AS direct');
  });
});

describe('the tool says which field answers which question', () => {
  const code = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const at = code.indexOf("name: 'get_intro_status'");
  const description = code.slice(at, code.indexOf('input_schema', at));

  it('names the cost of confusing them', () => {
    expect(description).toContain('tells the owner something untrue about a third person');
  });

  it('spells out all three states of the channel', () => {
    expect(description).toContain('contact_handed_over: true');
    expect(description).toContain('chose to stay in the middle');
    expect(description).toContain('not permission either way');
  });

  it('says what the other field does NOT mean', () => {
    expect(description).toContain('says nothing about the channel');
  });
});
