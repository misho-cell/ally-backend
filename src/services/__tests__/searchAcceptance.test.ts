jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../searchOutcome.service', () => ({ recordSearchOutcome: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query as _query } from '../../db/postgres/client';
import { recordSearchOutcome } from '../searchOutcome.service';
import { noteSearchVerdict, verdictOn } from '../searchAcceptance';

/** 2810 (AD-015): an accepted search counts as a success; a refused one says so. */
const mockQuery = _query as jest.Mock;
const mockRecord = recordSearchOutcome as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('the owner’s verdict on a search (2810)', () => {
  it.each([
    'ეს მჭირდებოდა, მადლობა.',
    'ზუსტად ეს!',
    "That's exactly what I needed",
    'Perfect, thanks',
    'То, что нужно',
    'Justo lo que necesitaba',
  ])('„%s" accepts', (line) => expect(verdictOn(line)).toBe('accepted'));

  it.each(['ეს არ მჭირდება', 'Not what I needed', 'Не подходит', 'No me sirve'])(
    '„%s" refuses',
    (line) => expect(verdictOn(line)).toBe('refused'),
  );

  it.each(['მადლობა', 'who else do I have as a lawyer?', 'perfect '.repeat(20)])(
    '„%s" is no verdict',
    (line) => expect(verdictOn(line)).toBeNull(),
  );

  it('records it on the newest open search, never over a rung already climbed', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 314 }] });
    await noteSearchVerdict('7', 'ეს მჭირდებოდა');
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        searchId: 314,
        userId: '7',
        outcome: 'accepted',
        onlyIfUnset: true,
      }),
    );
  });

  it('no recent search, nothing recorded; an ordinary line reads nothing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await noteSearchVerdict('7', 'Perfect');
    await noteSearchVerdict('7', 'ვინ არის ნოტარიუსი?');
    expect(mockRecord).not.toHaveBeenCalled();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('every owner line passes through it', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('if (!ownerAbsent) void noteSearchVerdict(userId, userMessage);');
  });
});
