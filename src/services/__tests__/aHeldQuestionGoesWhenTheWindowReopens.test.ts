jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { heldAsksWakeNote, holdAsk, releaseDueHeldAsks } from '../heldAsks.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => jest.clearAllMocks());

/**
 * The tester's 983: an approved plan's question was refused by the
 * recipient's 24-hour limit; at the wake the run guessed („ალბათ") whether it
 * had reopened and asked the owner for a second yes. The question is held,
 * and the wake is told exactly what to send.
 */
describe('a question held by the recipient’s limit', () => {
  it('is recorded once per goal and person, with its reopening', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as never);
    const at = new Date('2026-10-02T09:16:00Z');
    await holdAsk(11815, 172756, 'Netai Test 48', 'იცნობ კარგ ბუღალტერს?', at);
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('WHERE NOT EXISTS');
    expect(params).toEqual([11815, 172756, 'Netai Test 48', 'იცნობ კარგ ბუღალტერს?', at]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('is released only once its window has reopened, and only once', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { id: 1, contact_name: 'Netai Test 48', question: 'q', reopens_at: '2026-10-02T09:16:00Z' },
      ],
      rowCount: 1,
    } as never);
    const held = await releaseDueHeldAsks(11815);
    expect(held[0].reopens_at).toBe('2026-10-02T09:16:00.000Z');
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain('reopens_at <= NOW()');
    expect(sql).toContain('released_at IS NULL');
    expect(sql).toContain('SET released_at = NOW()');
  });

  it('tells the run the approval is the consent: send it, never ask again, never guess', () => {
    const note = heldAsksWakeNote([
      { id: 1, contact_name: 'Netai Test 48', question: 'იცნობ კარგ ბუღალტერს?', reopens_at: '' },
    ]);
    expect(note).toContain('• Netai Test 48: „იცნობ კარგ ბუღალტერს?"');
    expect(note).toContain('D119');
    expect(note).toContain('ask_contact');
    expect(note).toContain('მფლობელს ხელახლა არ ჰკითხო');
    expect(note).toContain('„ალბათ" არ დაწერო');
  });
});

describe('where it is wired', () => {
  const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
  const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');

  it('holds the question where the limit refuses it, and releases it when it goes', () => {
    expect(asks).toContain('await holdAsk(taskId, toUserId, toName, trimmed, reopensAt);');
    expect(asks).toContain('void releaseHeldAsk(taskId, toUserId)');
  });

  it('adds the held questions to the scheduled wake', () => {
    expect(engine).toContain('await wakeTask(task.id, await scheduledWakeText(task.id));');
    expect(engine).toContain('const held = await releaseDueHeldAsks(taskId);');
  });
});
