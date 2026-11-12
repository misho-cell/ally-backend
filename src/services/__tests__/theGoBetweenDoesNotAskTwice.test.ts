import { readFileSync } from 'fs';
import { join } from 'path';

const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...args: unknown[]) => mockQuery(...args),
}));
jest.mock('../taskAsks.service', () => ({ answerIsTheirOwnWords: jest.fn() }));

import { serverAlreadyAskedThem } from '../introResponse';

/**
 * Lika's podcast test (12 Nov, B03): the server asked the person in the
 * go-between's name the moment she said yes; her own assistant asked him again
 * in a second conversation, and his answers went to her instead of the asker.
 */
describe('a go-between who already said yes', () => {
  beforeEach(() => mockQuery.mockReset());

  it('does not ask the person again while the server’s question waits', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ waiting: true }] });
    await expect(serverAlreadyAskedThem('160', '+995555000111')).resolves.toBe(true);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("ir.status = 'accepted'");
    expect(sql).toContain('ir.target_answered_at IS NULL');
    expect(params[0]).toBe('160');
  });

  it('asks freely when nothing waits, or nothing could be read', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ waiting: false }] });
    await expect(serverAlreadyAskedThem('160', '+995555000111')).resolves.toBe(false);
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    await expect(serverAlreadyAskedThem('160', '+995555000111')).resolves.toBe(false);
    quiet.mockRestore();
  });

  it('reads nothing without a whole number', async () => {
    await expect(serverAlreadyAskedThem('160', undefined)).resolves.toBe(false);
    await expect(serverAlreadyAskedThem('160', '123')).resolves.toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('is wired into ask_contact', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain("if (await serverAlreadyAskedThem(userId, input['phone'])) {");
    expect(chat).toContain('return { sent: false, error: SERVER_ALREADY_ASKED_NOTE };');
  });
});
