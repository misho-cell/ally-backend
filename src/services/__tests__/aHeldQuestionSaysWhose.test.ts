jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { heldAsksNote } from '../heldAskNote.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const rows = (data: unknown[]): void => {
  mockQuery.mockResolvedValueOnce({ rows: data, rowCount: data.length } as never);
};

/**
 * The tester's 1110 (34006, 34009): the follow-up „why was it not sent?" said
 * „from other people" when both questions were this owner's own.
 */
describe('a held question in the goal’s section', () => {
  beforeEach(() => mockQuery.mockReset());

  it('says the earlier questions were the owner’s own when they were', async () => {
    rows([{ to_user_id: 9, contact_name: 'გიორგი აბაშიძე', reopens_at: '2026-10-04 16:26' }]);
    rows([{ from_user_id: '501' }, { from_user_id: '501' }]);
    const note = await heldAsksNote(15420, '501');
    expect(note).toContain('გიორგი აბაშიძე');
    expect(note).toContain('ყველა მფლობელის საკუთარი კითხვა იყო');
    expect(note).not.toMatch(/—\s*სხვა ადამიანებისგან/);
  });

  it('says others only when they were others', async () => {
    rows([{ to_user_id: 9, contact_name: 'გიორგი', reopens_at: '2026-10-04 16:26' }]);
    rows([{ from_user_id: '7' }, { from_user_id: '8' }]);
    expect(await heldAsksNote(1, '501')).toContain('— სხვა ადამიანებისგან');
  });

  it('is nothing when no question is held', async () => {
    rows([]);
    expect(await heldAsksNote(1, '501')).toBe('');
  });

  it('rides in the goal’s section of the prompt', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      "(boundTask ? buildTaskEngineSection(boundTask, boundAsks) : '') +\n      heldNote +",
    );
  });
});
