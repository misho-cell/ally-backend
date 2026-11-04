jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { askThreadsForName } from '../askThreadByName';
import { buildToolsForThread } from '../chat.service';
import { closeOpenQuestions } from '../taskAsks.service';

/**
 * #8746 (Tornike, 4 Nov, P1): „ჩახურე" on old test questions had no tool, so
 * the assistant answered each asker and Lika got „it was a test" four times.
 * A closed question leaves the member's list and the asker is sent nothing.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => mockQuery.mockReset());

describe('closing an open question', () => {
  it('takes it off the list and writes nothing to the asker', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 2 } as never);
    expect(await closeOpenQuestions('7', [11, 12])).toBe(2);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain("SET status = 'cancelled'");
    expect(String(sql)).toContain("status = 'sent'");
    expect(params).toEqual(['7', [11, 12]]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('does nothing for no question', async () => {
    expect(await closeOpenQuestions('7', [])).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('finds every open question from the one asker named', () => {
    const open = [
      { askThreadId: 1, askerName: 'Lika Osepashvili' },
      { askThreadId: 2, askerName: 'Giorgi T' },
      { askThreadId: 3, askerName: 'Lika Osepashvili' },
    ];
    expect(askThreadsForName(open, 'ლიკა')).toEqual([1, 3]);
    expect(askThreadsForName(open, '')).toEqual([]);
    expect(askThreadsForName(open, 'Nobody')).toEqual([]);
  });

  it('is offered in a question’s own chat while the member is there, and sends through no asker-facing path', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    const tools = await buildToolsForThread('7', 'incoming_ask', false);
    expect(tools.map((t) => t.name)).toContain('close_open_question');
    const absent = await buildToolsForThread('7', 'incoming_ask', true);
    expect(absent.map((t) => t.name)).not.toContain('close_open_question');
    const source = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const handler = source.slice(
      source.indexOf("case 'close_open_question'"),
      source.indexOf("case 'list_answer_rules'"),
    );
    expect(handler).not.toMatch(/sendApprovedAskAnswer|replyInWhatsapp|createAsk/u);
  });
});
