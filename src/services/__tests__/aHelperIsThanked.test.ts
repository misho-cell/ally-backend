jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../threads.service', () => ({
  saveThreadMessage: jest.fn().mockResolvedValue(undefined),
  userLanguage: jest.fn().mockResolvedValue('ka'),
}));
jest.mock('../notification.service', () => ({
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query as _query } from '../../db/postgres/client';
import { saveThreadMessage as _save } from '../threads.service';
import { sendPushNotification as _push } from '../notification.service';
import {
  saysAHelperHelped,
  sendHelperThanks,
  settleThanksTap,
  thankForSolvedGoal,
  thankHelperNamedIn,
} from '../helperThanks.service';
import { againChoices, thankChoices, thanksTapOf, ThanksTap } from '../helperThanksCards';

/** 1692 part 1 (A9): „helped" → thank them? → one line to the helper; then a private „ask again?". */
const mockQuery = _query as jest.Mock;
const mockSave = _save as jest.Mock;
const mockPush = _push as jest.Mock;
const rows = (r: unknown[]): { rows: unknown[] } => ({ rows: r });
const WAITING = {
  id: 4,
  helper_user_id: 77,
  helper_thread_id: 900,
  helper_name: 'ზურაბი',
  asker_name: 'ნინო',
};

/** D756's send: the ask, the claim, the claimed row, the chain. */
function routeSend(claimed: boolean): void {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('FROM task_asks ta') && sql.includes('WHERE ta.id = $1'))
      return Promise.resolve(
        rows([{ task_id: 3, helper_user_id: 77, card_thread_id: 55, helper_name: 'ზურაბი' }]),
      );
    if (sql.includes('INSERT INTO helper_thanks'))
      return Promise.resolve(rows(claimed ? [{ id: 4 }] : []));
    if (sql.includes('FROM helper_thanks ht JOIN task_asks'))
      return Promise.resolve(rows([WAITING]));
    return Promise.resolve(rows([]));
  });
}

/** Answers each query by what it asks: the waiting card, the claim, the chain. */
function route(waiting: unknown, chain: unknown[] = [], claimed = true): void {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('FROM helper_thanks ht JOIN task_asks'))
      return Promise.resolve(rows([waiting]));
    if (sql.includes('RETURNING id')) return Promise.resolve(rows(claimed ? [{ id: 4 }] : []));
    if (sql.includes('WITH RECURSIVE chain')) return Promise.resolve(rows(chain));
    return Promise.resolve(rows([]));
  });
}

beforeEach(() => jest.clearAllMocks());

describe('the thank-you card', () => {
  it('reads only its own buttons, in every language', () => {
    expect(thanksTapOf(thankChoices('ka')[0])).toBe(ThanksTap.Thank);
    expect(thanksTapOf(thankChoices('en')[1])).toBe(ThanksTap.DoNotThank);
    expect(thanksTapOf(againChoices('ru')[0])).toBe(ThanksTap.AgainYes);
    expect(thanksTapOf(againChoices('es')[1])).toBe(ThanksTap.AgainNo);
    expect(thanksTapOf('კი')).toBeNull();
  });

  /** D756 (the founder, box 49153): no card — the thanks go out at once, once per ask. */
  it('thanks the helper at once, with no card to the owner, once per ask', async () => {
    routeSend(true);
    expect(await sendHelperThanks('42', 17000)).toBe(true);
    expect(mockSave).toHaveBeenCalledWith(
      900,
      77,
      'assistant',
      'ნინო გიხდის მადლობას დახმარებისთვის.',
    );
    expect(mockSave).not.toHaveBeenCalledWith(
      55,
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(mockSave).toHaveBeenCalledTimes(1);

    mockSave.mockClear();
    routeSend(false);
    expect(await sendHelperThanks('42', 17000)).toBe(false);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('on yes, sends the helper one fixed line and rings once, then asks „again?"', async () => {
    route(WAITING);
    const reply = await settleThanksTap('42', 55, ThanksTap.Thank, 'ka');
    expect(mockSave).toHaveBeenCalledWith(
      900,
      77,
      'assistant',
      'ნინო გიხდის მადლობას დახმარებისთვის.',
    );
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(reply?.text).toContain('გადავეცი ზურაბს.');
    expect(reply?.choices).toEqual(againChoices('ka'));
    const update = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("SET state = 'decided'"),
    );
    expect(update?.[1]).toEqual([4, 'thanks_only']);
    expect(update?.[0]).toContain("AND state = 'offered'");
  });

  it('thanks once when „yes" arrives twice — the second tap finds the card already claimed', async () => {
    route(WAITING, [], false);
    expect(await settleThanksTap('42', 55, ThanksTap.Thank, 'ka')).toBeNull();
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('is never offered for an ask nobody answered, or one that was declined', () => {
    const service = readFileSync(join(__dirname, '..', 'helperThanks.service.ts'), 'utf8');
    expect(service).toContain("AND ta.status = 'answered' AND ta.declined_at IS NULL");
  });

  it('a card or day-14 row left behind is claimed too; a thanked one never again', () => {
    const service = readFileSync(join(__dirname, '..', 'helperThanks.service.ts'), 'utf8');
    expect(service).toContain(
      "WHERE helper_thanks.state IN ('offered', 'followed_up') AND helper_thanks.thanked_at IS NULL",
    );
  });

  it('thanks everyone further down the chain who answered, each as they saved the asker', async () => {
    route({ ...WAITING, ask_id: 17000, asker_user_id: 42 }, [
      { user_id: 88, thread_id: 901, asker_name: 'ნინო ბერიძე' },
      { user_id: 99, thread_id: 902, asker_name: 'ნინო' },
    ]);
    await settleThanksTap('42', 55, ThanksTap.Thank, 'ka');
    expect(mockSave).toHaveBeenCalledWith(
      901,
      88,
      'assistant',
      'ნინო ბერიძე გიხდის მადლობას დახმარებისთვის.',
    );
    expect(mockSave).toHaveBeenCalledWith(
      902,
      99,
      'assistant',
      'ნინო გიხდის მადლობას დახმარებისთვის.',
    );
    expect(mockPush).toHaveBeenCalledTimes(3);
    const chain = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('WITH RECURSIVE chain'),
    );
    expect(chain?.[1]).toEqual([17000, 42, 6]);
  });

  it('on no, sends nothing to the helper and still asks „again?"', async () => {
    route(WAITING);
    const reply = await settleThanksTap('42', 55, ThanksTap.DoNotThank, 'ka');
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(reply?.choices).toEqual(againChoices('ka'));
  });

  it('stores „would you ask again?" and says nothing more', async () => {
    route(WAITING);
    expect((await settleThanksTap('42', 55, ThanksTap.AgainNo, 'ka'))?.text).toBe('კარგი.');
    const update = mockQuery.mock.calls.find(([sql]) => String(sql).includes('ask_again = $2'));
    expect(update?.[1]).toEqual([4, false]);
  });

  it('is not the server’s when no card waits here', async () => {
    mockQuery.mockResolvedValue(rows([]));
    expect(await settleThanksTap('42', 55, ThanksTap.Thank, 'ka')).toBeNull();
  });

  it('is sent from a „helped" debrief and never fails it', () => {
    const debrief = readFileSync(join(__dirname, '..', 'debrief.service.ts'), 'utf8');
    expect(debrief).toContain('await sendHelperThanks(userId, refId).catch(');
  });
});

describe('a goal closed as solved (§113.1, D756)', () => {
  it('thanks for the newest real answer on the goal', async () => {
    routeSend(true);
    mockQuery.mockImplementationOnce(() => Promise.resolve(rows([{ id: 17001 }])));
    expect(await thankForSolvedGoal('42', 3)).toBe(true);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain("status = 'answered' AND declined_at IS NULL");
    expect(params).toEqual([3, '42']);
    expect(mockQuery.mock.calls[1][1]).toEqual([17001, '42']);
  });

  it('thanks nobody when nobody answered on the goal', async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    expect(await thankForSolvedGoal('42', 3)).toBe(false);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('is fired from the one place every solved close passes', () => {
    const store = readFileSync(join(__dirname, '..', 'taskStore.service.ts'), 'utf8');
    const hook = store.slice(
      store.indexOf("if (updated && status === 'closed' && closedAs === 'finished') {"),
    );
    expect(hook.slice(0, 400)).toContain('thankForSolvedGoal(userId, taskId)');
  });
});

/** D756's third path (the tester's 48874): „ნატოს პასუხი დამეხმარა", the goal still open. */
describe('the owner says in chat that a helper helped', () => {
  it('reads „helped" and never „did not help"', () => {
    expect(saysAHelperHelped('ნატოს პასუხი დამეხმარა — ზაზამ ონკანი შეაკეთა')).toBe(true);
    expect(saysAHelperHelped('Nato’s answer helped me a lot')).toBe(true);
    expect(saysAHelperHelped('ნატოს პასუხი არ დამეხმარა')).toBe(false);
    expect(saysAHelperHelped('ნატომ მიპასუხა')).toBe(false);
  });

  it('thanks the one answered helper the line names', async () => {
    routeSend(true);
    mockQuery.mockImplementationOnce(() =>
      Promise.resolve(
        rows([
          { ask_id: 17000, helper_name: 'ნატო დამხმარიძე' },
          { ask_id: 17002, helper_name: 'ლევან ხელოსანაძე' },
        ]),
      ),
    );
    expect(await thankHelperNamedIn('42', 'ნატოს პასუხი დამეხმარა')).toBe(true);
    expect(mockSave).toHaveBeenCalledWith(
      900,
      77,
      'assistant',
      'ნინო გიხდის მადლობას დახმარებისთვის.',
    );
  });

  it('thanks nobody when the line names no answered helper, or says nothing helped', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ ask_id: 17002, helper_name: 'ლევან ხელოსანაძე' }]));
    expect(await thankHelperNamedIn('42', 'ნატოს პასუხი დამეხმარა')).toBe(false);
    expect(await thankHelperNamedIn('42', 'გამარჯობა')).toBe(false);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('runs on the owner’s own line, never on an event', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain("if (!ownerAbsent && !userMessage.trimStart().startsWith('[')) {");
    expect(chat).toContain('void thankHelperNamedIn(userId, userMessage).catch(');
  });
});

/** 4060 (a), tester 49243: after the automatic thanks, no „ამით საქმე გადაწყდა?" in the same turn. */
describe('a run that thanked a helper asks nothing more', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('refuses the solved buttons and the close in that run', () => {
    const choices = chat.slice(chat.indexOf("case 'present_choices': {"));
    expect(choices.slice(0, 900)).toContain(
      'if (thankedThisRun(runId) && labels.includes(SOLVED_LABEL)) {',
    );
    const finish = chat.slice(chat.indexOf("case 'finish_task': {"));
    expect(finish.slice(0, 1800)).toContain(
      "if (!isConfirmed(input['confirmed']) && thankedThisRun(runId)) {",
    );
  });

  it('knows such a run by the owner’s own line', () => {
    const fn = chat.slice(chat.indexOf('function thankedThisRun('));
    expect(fn.slice(0, 300)).toContain("saysAHelperHelped(runOwnerLine.get(runId) ?? '')");
  });
});

/**
 * Tester 83097 (5 Nov, urgent): the day-14 job wrote „[asker] შენს რჩევას ჯერ კიდევ
 * მიჰყვება." into 28 old threads of 10 real members at 09:06Z. The founder's rule: a
 * helper hears back only on real news. The job and its line are gone.
 */
describe('no day-14 „following up your lead" line', () => {
  it('has no job that writes it', async () => {
    const index = readFileSync(join(__dirname, '..', '..', 'index.ts'), 'utf8');
    expect(index).not.toContain('startHelperFollowUps');
    const service = readFileSync(join(__dirname, '..', 'helperThanks.service.ts'), 'utf8');
    expect(service).not.toContain('followUpQuietLeads');
  });
});
