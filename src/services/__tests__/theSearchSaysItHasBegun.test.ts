jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../threads.service', () => ({
  __esModule: true,
  saveServerLine: jest
    .fn()
    .mockResolvedValue({ id: 77, content: 'saved', createdAt: '2026-10-04T11:05:33.800Z' }),
}));
jest.mock('../sse.service', () => ({ __esModule: true, emitMessageAppended: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { saveServerLine } from '../threads.service';
import { emitMessageAppended } from '../sse.service';
import {
  WORKING_LINE,
  WORKING_LINE_TOOLS,
  forgetWorkingLineRun,
  postWorkingLineOnce,
} from '../workingLine.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSave = saveServerLine as jest.MockedFunction<typeof saveServerLine>;
const mockEmit = emitMessageAppended as jest.MockedFunction<typeof emitMessageAppended>;
const due = (yes: boolean): never => ({ rows: [{ due: yes }], rowCount: 1 }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  mockSave.mockResolvedValue({ id: 77, content: 'saved', createdAt: '2026-10-04T11:05:33.800Z' });
});

/**
 * #364 — Giorgi, 2 October: when the questions are over and the search starts,
 * a real message says the work has begun, in his words; the findings follow.
 * A prompt line could not make that bubble (the tester's 1029, 0 of 3).
 */
describe('the line that the search has begun', () => {
  it('is Giorgi’s sentence, word for word', () => {
    expect(WORKING_LINE.ka).toBe(
      'ვმუშაობ შენს დავალებაზე, მოვძებნი შენს კონტაქტებში, კონტაქტების კონტაქტებში და ასევე ' +
        'მოვიძიებ ინფორმაციას ინტერნეტში, დამელოდე ცოტახანი და მოგაწვდი პირველად ინფორმაციას.',
    );
  });

  it('is written as its own message and shown at once', async () => {
    mockQuery.mockResolvedValueOnce(due(true));

    expect(await postWorkingLineOnce('118509', 30500, 'run-a', 'ka')).toBe(true);

    expect(mockSave).toHaveBeenCalledWith(30500, 118509, WORKING_LINE.ka);
    expect(mockEmit).toHaveBeenCalledWith(
      '118509',
      30500,
      expect.any(String),
      // #793: with the row's own time, so the live copy and history are one message.
      expect.objectContaining({
        messageId: '77',
        kind: 'working',
        createdAt: '2026-10-04T11:05:33.800Z',
      }),
    );
  });

  it('is written once per run, however many searches run in parallel', async () => {
    mockQuery.mockResolvedValue(due(true));
    const both = await Promise.all([
      postWorkingLineOnce('118509', 30500, 'run-b', 'ka'),
      postWorkingLineOnce('118509', 30500, 'run-b', 'ka'),
    ]);
    expect(both.filter(Boolean)).toHaveLength(1);
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('is not written in a thread that already has it, or that holds no open goal', async () => {
    mockQuery.mockResolvedValueOnce(due(false));
    expect(await postWorkingLineOnce('118509', 30500, 'run-c', 'ka')).toBe(false);
    expect(mockSave).not.toHaveBeenCalled();
    const [sql] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain("status = 'open'");
    expect(String(sql)).toContain('content = ANY($2::text[])');
  });

  it('never stops the search when it cannot be written', async () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    expect(await postWorkingLineOnce('118509', 30500, 'run-d', 'ka')).toBe(false);
    logged.mockRestore();
  });

  it('can be decided again for a run id once that run is forgotten', async () => {
    mockQuery.mockResolvedValue(due(true));
    await postWorkingLineOnce('118509', 30500, 'run-e', 'ka');
    forgetWorkingLineRun('run-e');
    expect(await postWorkingLineOnce('118509', 30500, 'run-e', 'ka')).toBe(true);
  });

  it('is asked before the first search of an owner run, and never on a wake', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'if (!ownerAbsent && WORKING_LINE_TOOLS.has(block.name)) {\n    await postWorkingLineOnce(',
    );
    expect([...WORKING_LINE_TOOLS]).toEqual(
      expect.arrayContaining(['search_by_tag', 'search_second_degree', 'web_search']),
    );
    // 44884: looking up the one person named is not „the search".
    expect(WORKING_LINE_TOOLS.has('search_contact_by_name')).toBe(false);
  });
});
