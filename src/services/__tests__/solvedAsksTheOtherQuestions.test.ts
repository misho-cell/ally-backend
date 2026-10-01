jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../taskAsks.service', () => ({ __esModule: true, cancelAsksForTask: jest.fn() }));
jest.mock('../threads.service', () => ({
  __esModule: true,
  saveThreadMessage: jest.fn(),
  threadLanguage: jest.fn(),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { cancelAsksForTask } from '../taskAsks.service';
import { saveThreadMessage, threadLanguage } from '../threads.service';
import {
  offerOpenAsksChoice,
  OpenAsksTap,
  openAsksChoices,
  openAsksTapOf,
  settleOpenAsksOnTap,
} from '../openAsksAfterSolved';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockCancel = cancelAsksForTask as jest.MockedFunction<typeof cancelAsksForTask>;
const mockSave = saveThreadMessage as jest.MockedFunction<typeof saveThreadMessage>;
const mockLanguage = threadLanguage as jest.MockedFunction<typeof threadLanguage>;

const TASK_ID = 11160;
const THREAD_ID = 26710;
const OWNER_ID = 171937;
const [CLOSE_KA, KEEP_KA] = openAsksChoices('ka');
const [CLOSE_EN, KEEP_EN] = openAsksChoices('en');

function rows(list: readonly unknown[]): never {
  return { rows: list, rowCount: list.length } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLanguage.mockResolvedValue('ka');
  mockCancel.mockResolvedValue(2 as never);
});

/**
 * ROW 311 — „solved" used to cancel every open question at once. The owner is
 * now asked first, with two buttons, and the server acts on the one pressed.
 */
describe('the two buttons', () => {
  it('reads either button in any language, and nothing typed', () => {
    expect(openAsksTapOf(CLOSE_KA)).toBe(OpenAsksTap.Close);
    expect(openAsksTapOf(` ${KEEP_EN} `)).toBe(OpenAsksTap.Keep);
    expect(openAsksTapOf(KEEP_KA)).toBe(OpenAsksTap.Keep);
    expect(openAsksTapOf(CLOSE_EN)).toBe(OpenAsksTap.Close);
    expect(openAsksTapOf('დახურე ყველაფერი')).toBeNull();
    expect(openAsksTapOf('')).toBeNull();
  });

  it('puts close first', () => {
    expect(openAsksChoices('en')).toEqual(['Close the other questions', 'Keep them open']);
  });
});

describe('the offer after „solved"', () => {
  it('writes one line with both buttons when questions are still out', async () => {
    mockQuery.mockResolvedValue(rows([{ n: '3' }]));

    expect(await offerOpenAsksChoice(TASK_ID, THREAD_ID, OWNER_ID)).toBe(3);

    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain("status = 'sent'");
    expect(params).toEqual([TASK_ID]);
    expect(timeout).toBeGreaterThan(0);
    expect(mockSave).toHaveBeenCalledTimes(1);
    const call = mockSave.mock.calls[0];
    expect(call[0]).toBe(THREAD_ID);
    expect(call[1]).toBe(OWNER_ID);
    expect(String(call[3])).toContain('3 ადამიანს');
    expect(call[6]).toEqual([CLOSE_KA, KEEP_KA]);
  });

  it('writes nothing when no question is out', async () => {
    mockQuery.mockResolvedValue(rows([{ n: '0' }]));
    expect(await offerOpenAsksChoice(TASK_ID, THREAD_ID, OWNER_ID)).toBe(0);
    expect(mockSave).not.toHaveBeenCalled();
  });
});

describe('the tap', () => {
  it('cancels the questions on „close", and tells the run it is done', async () => {
    mockQuery.mockResolvedValue(rows([{ id: TASK_ID }]));

    const told = await settleOpenAsksOnTap(String(OWNER_ID), THREAD_ID, CLOSE_KA);

    expect(mockCancel).toHaveBeenCalledWith(TASK_ID);
    expect(told).toContain('სერვერმა უკვე შეასრულა');
    expect(told).toContain('2 ღია კითხვა დაიხურა');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain("t.status = 'closed'");
    expect(String(sql)).toContain('LIMIT 1');
    expect(params).toEqual([THREAD_ID, String(OWNER_ID)]);
  });

  it('cancels nothing on „keep"', async () => {
    mockQuery.mockResolvedValue(rows([{ id: TASK_ID }]));
    const told = await settleOpenAsksOnTap(String(OWNER_ID), THREAD_ID, KEEP_EN);
    expect(mockCancel).not.toHaveBeenCalled();
    expect(told).toContain('ღიად დატოვა');
  });

  it('does nothing for a typed message, without reading the database', async () => {
    expect(await settleOpenAsksOnTap(String(OWNER_ID), THREAD_ID, 'მადლობა')).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('does nothing twice: a second tap finds no questions left', async () => {
    mockQuery.mockResolvedValue(rows([]));
    expect(await settleOpenAsksOnTap(String(OWNER_ID), THREAD_ID, CLOSE_KA)).toBeNull();
    expect(mockCancel).not.toHaveBeenCalled();
  });
});

describe('where it is wired', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');

  it('finish_task offers the choice instead of cancelling, when there is a thread', () => {
    const finish = chat.slice(
      chat.indexOf("updateTask(userId, taskId, 'closed', summary, 'finished')"),
    );
    const body = finish.slice(0, 1200);
    expect(body).toContain('await offerOpenAsksChoice(taskId, threadId, Number(userId))');
    expect(body).toContain('do not cancel anything');
    expect(body.indexOf('cancelAsksForTask')).toBeGreaterThan(
      body.indexOf('threadId === undefined'),
    );
  });

  it('the tap is acted on before the run, beside the approve tap', () => {
    expect(chat).toContain('await settleOpenAsksOnTap(userId, threadId, userMessage)');
    expect(chat).toContain('[tappedContext, approvedByTap, openAsksSettled]');
  });

  it('a closed goal’s answer is shown as a card, never just marked delivered', () => {
    const sweep = engine.slice(engine.indexOf('async function sweepUnwokenAnswers'));
    expect(sweep.slice(0, 900)).toContain('await showClosedGoalAnswers(ask.task_id)');
    const retry = engine.slice(engine.indexOf('export function deliverAnswersWhenFree'));
    expect(retry.slice(0, 900)).toContain('await showClosedGoalAnswers(taskId)');
  });
});
