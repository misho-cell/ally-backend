jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../threads.service', () => ({
  __esModule: true,
  saveThreadMessage: jest.fn().mockResolvedValue(undefined),
  userLanguage: jest.fn().mockResolvedValue('ka'),
}));
jest.mock('../notification.service', () => ({
  __esModule: true,
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));

import { query } from '../../db/postgres/client';
import { createRelayAsk } from '../taskAsks.service';
import { resolveIntroductionRequest } from '../introduction.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * THE SAME FAULT AS THE GOAL ID, AT THE OTHER TWO DOORS A MODEL CAN REACH.
 *
 * `relay_ask` passes `Number(input['ask_id'])` and `respond_to_introduction`
 * passes `input['request_id'] as number` — a CAST, which does not convert
 * anything. So a missing field is `NaN` at one door and the word itself at the
 * other, and both reach `WHERE id = $1` on an integer column. Postgres raises
 * `invalid input syntax for type integer`, and nothing catches a tool that
 * throws: `processToolBlocks` runs the turn in a bare `Promise.all`. The run
 * dies where the answer should have been „not found".
 *
 * Both functions ALREADY have that answer — `{ sent: false, error: 'Ask not
 * found.' }` and `{ ok: false, code: 'not_found' }`. They simply could not
 * reach it, because the query came first.
 *
 * The introduction door has a second path that takes a REFERENCE rather than
 * an id, and that one is a text column where a word is a legitimate value. It
 * is held below so the guard cannot be widened into breaking it.
 */
const NOT_AN_ID = [Number(undefined), Number('x'), 0, -1, 1.5];

const OWNER = '501';
const A_CONTACT = 'გიორგი';

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
});

describe('relay_ask with an id that is not an id', () => {
  it.each(NOT_AN_ID)('answers "not found" without asking the database — %p', async (id) => {
    const outcome = await createRelayAsk(OWNER, id, A_CONTACT, 'როდის შეგიძლია?');

    // The relay wraps every failure in guidance for the model, so the fact
    // held here is which failure it is, not the whole sentence.
    expect(outcome.sent).toBe(false);
    expect(outcome.error).toMatch(/^Ask not found\./);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('asks the database when the id is an id', async () => {
    await createRelayAsk(OWNER, 1255, A_CONTACT, 'როდის შეგიძლია?');

    expect(mockQuery).toHaveBeenCalled();
    expect(mockQuery.mock.calls[0][1]).toEqual([1255]);
  });
});

describe('respond_to_introduction with an id that is not an id', () => {
  it.each(NOT_AN_ID)('answers "not found" without asking the database — %p', async (id) => {
    const outcome = await resolveIntroductionRequest(OWNER, { requestId: id }, 'decline', {
      source: 'chat',
    });

    expect(outcome).toMatchObject({ ok: false, code: 'not_found' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  /**
   * The reference path is a TEXT column, so a word is a legitimate value there
   * and must still reach the database. Without this the guard above could be
   * widened to „reject anything that is not a number" and quietly close the
   * door the buttons actually use.
   */
  it('still looks up a request by its reference', async () => {
    await resolveIntroductionRequest(OWNER, { requestRef: 'intro_abc123' }, 'decline', {
      source: 'chat',
    });

    expect(mockQuery).toHaveBeenCalled();
    expect(mockQuery.mock.calls[0][1]).toEqual([OWNER, 'intro_abc123']);
  });

  it('asks the database when the id is an id', async () => {
    await resolveIntroductionRequest(OWNER, { requestId: 4471 }, 'decline', { source: 'chat' });

    expect(mockQuery).toHaveBeenCalled();
    expect(mockQuery.mock.calls[0][1]).toEqual([OWNER, 4471]);
  });
});
