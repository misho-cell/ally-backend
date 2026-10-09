jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../pendingUpdates.service', () => ({ queueFollowUp: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query as _query } from '../../db/postgres/client';
import { queueFollowUp as _queue } from '../pendingUpdates.service';
import { ANSWER_DEBRIEF_ON, answerDebriefInstruction, armAnswerDebrief } from '../debrief.service';

/** 1692 part 2: „how did <helper>'s answer work out?" — on since Misho's word (§111.3). */
const mockQuery = _query as jest.Mock;
const mockQueue = _queue as jest.Mock;

describe('the answer debrief', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is armed once per answer, three days out (§111.3)', async () => {
    expect(ANSWER_DEBRIEF_ON).toBe(true);
    mockQuery.mockResolvedValueOnce({ rows: [{ ref_id: 17000 }], rowCount: 1 });
    await armAnswerDebrief('42', 17000, 3, 'ზურაბი');
    expect(mockQueue).toHaveBeenCalledTimes(1);
    expect(mockQueue.mock.calls[0][3]).toMatchObject({ about: 'answered_ask', ask_id: 17000 });
  });

  it('is not armed a second time for the same answer', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await armAnswerDebrief('42', 17000, 3, 'ზურაბი');
    expect(mockQueue).not.toHaveBeenCalled();
  });

  it('carries exactly AV’s text', () => {
    expect(answerDebriefInstruction('ზურაბი', 17000)).toBe(
      'ზურაბი answered your question 3 days ago. Ask the owner in one line how it worked out. If it ' +
        'helped, record record_debrief_outcome (subject="relayed_ask", ref_id=17000, worked=true); if not, ' +
        'worked=false; if it is too early, not_yet=true.',
    );
  });

  it('is armed from a first, real answer and goes stale once the owner said', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).toContain("if (firstAnswer && !declined && who !== '') {");
    const debrief = readFileSync(join(__dirname, '..', 'debrief.service.ts'), 'utf8');
    expect(debrief).toContain(
      "return !(await hasDebriefRung(SUBJECT_TO_KIND.relayed_ask, Number(payload['ask_id'])));",
    );
  });
});
