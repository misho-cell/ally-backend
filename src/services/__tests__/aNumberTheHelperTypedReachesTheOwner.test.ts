jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));

import { query } from '../../db/postgres/client';
import { allowNumbersTheyTyped, ALLOW_CLOSE, ALLOW_OPEN, scrubText } from '../privacyScrub';
import { recordAskAnswer } from '../taskAsks.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const TYPED = '+44 7700 900123';
const OTHER = '+44 7700 900987';

/** #6360 (D587 point 3, tester 21:24Z): a number the go-between typed reaches the owner. */
describe('a number the helper typed themselves', () => {
  it('is handed over, written the way the assistant wrote it', () => {
    const answer = `მისი ნომერია ${TYPED}, შეუძლია დაურეკოს.`;
    expect(scrubText(allowNumbersTheyTyped(answer, [`აი ნომერი: ${TYPED}`]))).toBe(
      `მისი ნომერია ${ALLOW_OPEN}${TYPED}${ALLOW_CLOSE}, შეუძლია დაურეკოს.`,
    );
  });

  it('is the same number with or without the country code', () => {
    expect(allowNumbersTheyTyped('ნომერი: 7700900123', [TYPED])).toBe(
      `ნომერი: ${ALLOW_OPEN}7700900123${ALLOW_CLOSE}`,
    );
  });

  it('hands over nothing else: a number they did not type stays hidden', () => {
    const answer = `${TYPED} ან ${OTHER}`;
    expect(scrubText(allowNumbersTheyTyped(answer, [TYPED]))).toBe(
      `${ALLOW_OPEN}${TYPED}${ALLOW_CLOSE} ან [hidden]`,
    );
  });

  it('hands over nothing when they typed no number', () => {
    expect(scrubText(allowNumbersTheyTyped(`ნომერი: ${TYPED}`, ['კი, დაურეკოს']))).toBe(
      'ნომერი: [hidden]',
    );
  });

  it('leaves a number already handed over as it was', () => {
    const shared = `${ALLOW_OPEN}${TYPED}${ALLOW_CLOSE}`;
    expect(allowNumbersTheyTyped(shared, [TYPED])).toBe(shared);
  });
});

describe('the stored answer', () => {
  beforeEach(() => mockQuery.mockReset());

  function answerRound(ownLines: readonly string[]): void {
    mockQuery.mockImplementation(((sql: string, params?: unknown[]) => {
      if (sql.includes("c.role = 'user'"))
        return Promise.resolve({ rows: ownLines.map((content) => ({ content })), rowCount: 1 });
      if (sql.includes('UPDATE task_asks'))
        return Promise.resolve({
          rows: [{ id: 7, task_id: 3, answer: (params as unknown[])[1], to_user_id: 2 }],
          rowCount: 1,
        });
      return Promise.resolve({ rows: [{ from_name: 'ნანა' }], rowCount: 1 });
    }) as never);
  }

  it('keeps the number the helper typed on this thread', async () => {
    answerRound([`აი მისი ნომერი ${TYPED}`]);
    const out = await recordAskAnswer(55, `ელექტრიკოსს შეუძლია დაურეკოს: ${TYPED}`);
    expect(out?.answer).toBe(`ელექტრიკოსს შეუძლია დაურეკოს: ${ALLOW_OPEN}${TYPED}${ALLOW_CLOSE}`);
  });

  it('hides a number the helper never typed', async () => {
    answerRound(['კი, ვიცნობ']);
    const out = await recordAskAnswer(55, `ელექტრიკოსს შეუძლია დაურეკოს: ${TYPED}`);
    expect(out?.answer).toBe('ელექტრიკოსს შეუძლია დაურეკოს: [hidden]');
  });

  it('reads nothing more for an answer with no number', async () => {
    answerRound([]);
    await recordAskAnswer(55, 'კი, ვიცნობ');
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('LIMIT $2'))).toBe(false);
  });
});
