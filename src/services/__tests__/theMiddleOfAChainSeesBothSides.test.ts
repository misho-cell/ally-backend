const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  query: (...a: unknown[]) => mockQuery(...a),
  __esModule: true,
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { chainPositionOf, NOT_IN_A_CHAIN } from '../chainPosition.service';
import { RouteRole, RouteState } from '../routesBoard.service';

/** 4927 (Giorgi, 13 Oct): previous person → you → next person, for the middle of a chain. */
const rows = (r: unknown[]): unknown => ({ rows: r, rowCount: r.length });
const ASK = { ask_id: 20032, asker_id: 183290, name: 'გელა' };
const PASSED_ON = {
  id: 20040,
  name: 'ნინო',
  status: 'sent',
  answer: null,
  declined_at: null,
  seen_at: null,
  later_until: null,
  expired_at: null,
  updated_at: '2026-10-13T10:00:00.000Z',
};

beforeEach(() => jest.resetAllMocks());

describe('a question the owner was asked and passed on', () => {
  it('names who asked and lists whom it went on to, with each state', async () => {
    mockQuery.mockResolvedValueOnce(rows([ASK])).mockResolvedValueOnce(rows([PASSED_ON]));
    const out = await chainPositionOf(183289, 49872);
    expect(out.previous).toEqual({ name: 'გელა', member_id: 183290 });
    expect(out.next).toHaveLength(1);
    expect(out.next[0]).toMatchObject({
      ask_id: 20040,
      person_name: 'ნინო',
      state: RouteState.Waiting,
    });
    const [, params, timeout] = mockQuery.mock.calls[1];
    expect(params).toEqual([20032, 183289, 20]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('reads only a question asked OF this owner in their own conversation', () => {
    const source = readFileSync(join(__dirname, '..', 'chainPosition.service.ts'), 'utf8');
    expect(source).toContain(
      'WHERE p.ask_thread_id = $1 AND p.to_user_id = $2 AND th.user_id = $2',
    );
    expect(source).toContain('WHERE c.parent_ask_id = $1 AND c.from_user_id = $2');
  });
});

describe('an introduction the owner was asked to make', () => {
  it('names who asked and the person to be introduced', async () => {
    mockQuery.mockResolvedValueOnce(rows([])).mockResolvedValueOnce(
      rows([
        {
          id: 6008,
          requester_id: 184198,
          requester_name: 'ლევანი',
          name: null,
          status: 'pending',
          target_name: 'თამარ ჯაფარიძე',
          updated_at: '2026-10-13T10:00:00.000Z',
        },
      ]),
    );
    const out = await chainPositionOf(184199, 51141);
    expect(out.previous).toEqual({ name: 'ლევანი', member_id: 184198 });
    expect(out.next[0]).toMatchObject({
      kind: 'introduction',
      person_name: 'თამარ ჯაფარიძე',
      role: RouteRole.Addressee,
      state: RouteState.Waiting,
      summary: null,
    });
  });
});

it('is nothing for a conversation that is no chain link, or not theirs', async () => {
  mockQuery.mockResolvedValue(rows([]));
  expect(await chainPositionOf(184199, 1)).toEqual(NOT_IN_A_CHAIN);
});

/** Giorgi's retest (13 Oct): the owner's own goal shows you → the people it asked. */
it('is you → the people asked on the owner’s own goal, even one person', async () => {
  mockQuery
    .mockResolvedValueOnce(rows([]))
    .mockResolvedValueOnce(rows([]))
    .mockResolvedValueOnce(rows([{ id: 900 }]))
    .mockResolvedValueOnce(rows([{ ...PASSED_ON, person_id: 501 }]))
    .mockResolvedValueOnce(rows([]));
  const out = await chainPositionOf(184199, 51300);
  expect(out.previous).toBeNull();
  expect(out.next).toHaveLength(1);
  expect(out.next[0]).toMatchObject({ person_name: 'ნინო' });
});

it('GET /threads/:id/chain-position answers 200 with the position, and no database text', () => {
  const route = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'threads.routes.ts'),
    'utf8',
  );
  expect(route).toContain("'/:id/chain-position',");
  expect(route).toContain('chainPositionOf(userId, Number(req.params.id))');
  expect(route).toContain("error: 'Could not read the chain'");
});
