jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { markAskWakeDelivered } from '../taskAsks.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => mockQuery.mockReset());

/**
 * #6865 retest (tester 0/3; owner threads 62669/62671/62673, 21:22–21:23Z):
 * the second line arrived while the first answer's wake was running, and the
 * run stamped the grown answer delivered.
 */
describe('stamping an answer delivered', () => {
  it('holds only for the answer the wake carried', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ delivered: false }], rowCount: 1 } as never);
    await expect(markAskWakeDelivered(26204, 'ნანას ელექტრიკოსი კარგი ხელოსანია')).resolves.toBe(
      false,
    );
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('WHEN $2::text IS NULL OR answer = $2 THEN NOW()');
    expect(sql).toContain('answer_shown_at = CASE');
    expect(params).toEqual([26204, 'ნანას ელექტრიკოსი კარგი ხელოსანია']);
  });

  it('is unconditional when no answer text is given', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ delivered: true }], rowCount: 1 } as never);
    await expect(markAskWakeDelivered(26204)).resolves.toBe(true);
    expect((mockQuery.mock.calls[0] as [string, unknown[]])[1]).toEqual([26204, null]);
  });

  it('delivers a grown answer again, and a later line shows its card again', () => {
    const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');
    expect(engine).toContain('if (!(await markAskWakeDelivered(ask.id, ask.answer))) grew = true;');
    expect(engine).toContain('if (grew) deliverAnswersWhenFree(taskId);');
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    const added = asks.slice(asks.indexOf('async function addedAfterDelivery('));
    expect(added.slice(0, added.indexOf('\n}\n'))).toContain('answer_shown_at = NULL');
  });
});
