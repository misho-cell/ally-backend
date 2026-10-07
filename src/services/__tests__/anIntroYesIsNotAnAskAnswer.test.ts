jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { pendingIntroInMediatorThread } from '../introduction.service';
import { claimsToHavePassedItOn } from '../replyGuards';

/**
 * #1783 (tester 41317, conv 40658): her „yes, only Saturday morning" was sent
 * to the answer tool as if it answered the earlier question; the send was
 * refused, and the reply still said „პასუხი გაიგზავნა.".
 */
const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => mockQuery.mockReset());

describe('pendingIntroInMediatorThread', () => {
  it('finds the open request this thread was asked about', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 4557 }], rowCount: 1 } as never);
    await expect(pendingIntroInMediatorThread('501', 40658)).resolves.toBe(4557);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("status = 'pending'");
    expect(params).toEqual([40658, '501']);
  });

  it('is null when none is open', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    await expect(pendingIntroInMediatorThread('501', 40658)).resolves.toBeNull();
  });
});

describe('the answer tool while a request is open', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('refuses before anything else and points to the introduction', () => {
    const at = chat.indexOf("case 'send_answer_to_asker': {");
    const body = chat.slice(at, at + 900);
    expect(body).toContain('const openIntro = await openIntroHere(userId, threadId);');
    expect(body.indexOf('openIntroHere')).toBeLessThan(body.indexOf("input['confirmed']"));
    expect(chat).toContain('Call respond_to_introduction with it — a yes ');
    expect(chat).toContain('connects them (D709: never ask how)');
  });
});

describe('the sent-claim guard', () => {
  it('catches „პასუხი გაიგზავნა" in a run that sent nothing', () => {
    expect(claimsToHavePassedItOn('პასუხი გაიგზავნა.')).toBe(true);
    expect(claimsToHavePassedItOn('ჯერ არაფერი გაიგზავნა.')).toBe(false);
  });
});
