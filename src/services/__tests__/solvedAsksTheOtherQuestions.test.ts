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

  /** Rule 8 of the Georgian block: the owner's own action, never an order to Netai. */
  it('says in Georgian what the owner does', () => {
    expect(openAsksChoices('ka')).toEqual(['ვხურავ დანარჩენ კითხვებს', 'ღიად ვტოვებ']);
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

/** The database as the tap sees it: which card this thread showed, and whether it was answered. */
function cardIs(card: { settled: boolean; choice?: string } | null, claimWins = true): void {
  mockQuery.mockImplementation(((sql: string) => {
    const text = String(sql);
    if (text.includes('open_asks_offered_at IS NOT NULL')) {
      return Promise.resolve(
        rows(
          card === null
            ? []
            : [{ id: TASK_ID, settled: card.settled, choice: card.choice ?? null }],
        ),
      );
    }
    if (text.includes('SET open_asks_settled_at = NOW()')) {
      return Promise.resolve(rows(claimWins ? [{ id: TASK_ID }] : []));
    }
    return Promise.resolve(rows([]));
  }) as never);
}

describe('the tap', () => {
  it('cancels the questions on „close", and tells the run it is done', async () => {
    cardIs({ settled: false });

    const told = await settleOpenAsksOnTap(String(OWNER_ID), THREAD_ID, CLOSE_KA);

    expect(mockCancel).toHaveBeenCalledWith(TASK_ID);
    expect(told).toContain('სერვერმა უკვე შეასრულა');
    expect(told).toContain('2 ღია კითხვა დაიხურა');
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('LIMIT 1');
    expect(params).toEqual([THREAD_ID, String(OWNER_ID)]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('cancels nothing on „keep"', async () => {
    cardIs({ settled: false });
    const told = await settleOpenAsksOnTap(String(OWNER_ID), THREAD_ID, KEEP_EN);
    expect(mockCancel).not.toHaveBeenCalled();
    expect(told).toContain('ღიად დატოვა');
  });

  it('does nothing for a typed message, without reading the database', async () => {
    expect(await settleOpenAsksOnTap(String(OWNER_ID), THREAD_ID, 'მადლობა')).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('does nothing in a thread that showed no card', async () => {
    cardIs(null);
    expect(await settleOpenAsksOnTap(String(OWNER_ID), THREAD_ID, CLOSE_KA)).toBeNull();
    expect(mockCancel).not.toHaveBeenCalled();
  });

  /**
   * The tester's 941, both ways: after „close", a „keep" reopened the goal;
   * after „keep", a „close" cancelled a kept question. The first tap answers
   * the card; every later one changes nothing and says so.
   */
  it.each([
    ['close after keep', CLOSE_KA],
    ['keep after close', KEEP_KA],
  ])('changes nothing on %s', async (_case, label) => {
    cardIs({ settled: true });

    const told = await settleOpenAsksOnTap(String(OWNER_ID), THREAD_ID, label);

    expect(mockCancel).not.toHaveBeenCalled();
    expect(told).toContain('არჩევანი უკვე გაკეთდა');
    expect(told).toContain('update_task არ გამოიძახო');
  });

  /** The tester's 944: a later „close" on a KEPT card said the questions were closed. */
  it('says which choice stands, so a kept card is never reported closed', async () => {
    cardIs({ settled: true, choice: 'keep' });
    const told = await settleOpenAsksOnTap(String(OWNER_ID), THREAD_ID, CLOSE_KA);
    expect(told).toContain('დანარჩენი კითხვები ღიაა და ასე რჩება');
    expect(told).not.toContain('უკვე დახურულია');
    cardIs({ settled: true, choice: 'close' });
    expect(await settleOpenAsksOnTap(String(OWNER_ID), THREAD_ID, KEEP_KA)).toContain(
      'დანარჩენი კითხვები უკვე დახურულია',
    );
  });

  it('records the choice with the claim', async () => {
    cardIs({ settled: false });
    await settleOpenAsksOnTap(String(OWNER_ID), THREAD_ID, KEEP_KA);
    const claim = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('SET open_asks_settled_at = NOW()'),
    );
    expect(String(claim?.[0])).toContain('open_asks_choice = $2');
    expect(claim?.[1]).toEqual([TASK_ID, 'keep']);
  });

  it('lets only one of two taps at the same moment act', async () => {
    cardIs({ settled: false }, false);
    const told = await settleOpenAsksOnTap(String(OWNER_ID), THREAD_ID, CLOSE_KA);
    expect(mockCancel).not.toHaveBeenCalled();
    expect(told).toContain('არჩევანი უკვე გაკეთდა');
  });

  it('still reads the earlier Georgian labels as taps', () => {
    expect(openAsksTapOf('დანარჩენი კითხვები დახურე')).toBe(OpenAsksTap.Close);
    expect(openAsksTapOf('ღიად დატოვე')).toBe(OpenAsksTap.Keep);
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

/** The tester's 961: one open question reads as one, not „მათი კითხვები". */
describe('the offer speaks of one person as one', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses the singular for a single open question', async () => {
    mockQuery.mockResolvedValue(rows([{ n: '1' }]));
    await offerOpenAsksChoice(TASK_ID, THREAD_ID, OWNER_ID);
    const line = String(mockSave.mock.calls[0][3]);
    expect(line).toContain('ერთ ადამიანს');
    expect(line).toContain('მისი კითხვა');
    expect(line).not.toContain('მათი');
  });
});
