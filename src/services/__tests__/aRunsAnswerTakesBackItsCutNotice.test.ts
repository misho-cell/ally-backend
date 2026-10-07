const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({ query: (...a: unknown[]) => mockQuery(...a) }));
jest.mock('../sse.service', () => ({ emitRunError: jest.fn() }));
jest.mock('../threads.service', () => ({
  saveThreadMessage: jest.fn(),
  threadLanguage: jest.fn(),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { withdrawOwnCutNotice } from '../cutOffRunNotice.service';
import { RUN_STRINGS } from '../runLanguage';

/** The tester's 45147 (conv 43076): „send it again" beside the run's own „I sent the question". */
describe('aRunsAnswerTakesBackItsCutNotice', () => {
  it('deletes only this run’s own cut-off notice in this thread', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1, rows: [] });
    await expect(withdrawOwnCutNotice(43076, 'run-1')).resolves.toBe(1);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("kind = 'error'");
    expect(sql).toContain('run_id = $2');
    expect(params[0]).toBe(43076);
    expect(params[1]).toBe('run-1');
    expect(params[2]).toContain(RUN_STRINGS.ka.restartedMidRun);
  });

  it('is called when a run saves its answer', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain("if (role === 'assistant' && kind === 'message' && runId !== null) {");
    expect(chat).toContain('await withdrawOwnCutNotice(threadId, runId)');
  });
});
