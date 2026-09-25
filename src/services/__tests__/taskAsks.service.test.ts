jest.mock('../../db/postgres/client', () => ({
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  query: jest.fn(),
  __esModule: true,
}));
jest.mock('../threads.service', () => ({
  __esModule: true,
  createThread: jest.fn().mockResolvedValue({
    id: 55,
    type: 'incoming_ask',
    title: 'x',
    is_task: true,
    status: 'needs_you',
    status_line: 'პასუხს ელოდება',
  }),
  saveThreadMessage: jest.fn().mockResolvedValue(undefined),
  // The recipient's own language, read from their messages anywhere — the ask
  // thread is empty at the moment this text is written. Georgian here keeps
  // every existing assertion in this file about the Georgian opening true.
  userLanguage: jest.fn().mockResolvedValue('ka'),
  threadLanguage: jest.fn().mockResolvedValue('ka'),
}));
jest.mock('../sse.service', () => ({ __esModule: true, emitThreadCreated: jest.fn() }));
jest.mock('../askOptOut.service', () => ({
  __esModule: true,
  isOptedOutFromAsks: jest.fn().mockResolvedValue(false),
}));
// The PHONE-level stop, which this file did not mock and therefore did not
// test — see „the phone-level half" at the bottom. `taskAsks.service` imports
// nothing else from this module, so a one-export mock covers it exactly.
jest.mock('../privacyRights.service', () => ({
  __esModule: true,
  isPhoneOptedOut: jest.fn().mockResolvedValue(false),
}));
jest.mock('../askBudget.service', () => ({
  __esModule: true,
  checkAskBudget: jest.fn().mockResolvedValue({ allowed: true }),
  checkFollowUpBudget: jest.fn().mockResolvedValue({ allowed: true }),
  RELAY_MESSAGES_PER_PERSON_PER_DAY: 4,
}));
// Resolves, because the real one does. A mock that hands back `undefined`
// where the function returns a Promise is a mock that lies, and it broke the
// moment a caller added a `.catch` — row 233's status fix, which is the kind
// of best-effort tail every other call in this file already has.
jest.mock('../threadStatus.service', () => ({
  __esModule: true,
  setThreadStatus: jest.fn().mockResolvedValue(undefined),
}));
// sendApprovedAskAnswer reaches taskEngine via a dynamic import (static would
// be a load-order cycle) — the mock intercepts that import all the same.
jest.mock('../taskEngine.service', () => ({
  __esModule: true,
  wakeTask: jest.fn().mockResolvedValue('woken'),
}));
jest.mock('../taskStore.service', () => ({ __esModule: true, getTaskById: jest.fn() }));
jest.mock('../notification.service', () => ({
  __esModule: true,
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../debrief.service', () => ({
  __esModule: true,
  armAskDebrief: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../answerRules.service', () => ({
  __esModule: true,
  matchAnswerRule: jest.fn().mockResolvedValue(null),
  recordRuleUse: jest.fn().mockResolvedValue(undefined),
  saveAnswerRule: jest.fn().mockResolvedValue({ ok: true, value: {} }),
}));
jest.mock('../warmth.service', () => ({
  __esModule: true,
  recordMutualWarmth: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../roster.service', () => ({
  __esModule: true,
  sharedRoster: jest.fn().mockResolvedValue(null),
}));

import { query } from '../../db/postgres/client';
import { armAskDebrief } from '../debrief.service';
import { matchAnswerRule, saveAnswerRule } from '../answerRules.service';
import { sharedRoster } from '../roster.service';
import { getTaskById } from '../taskStore.service';
import { isOptedOutFromAsks } from '../askOptOut.service';
import { isPhoneOptedOut } from '../privacyRights.service';
import { checkAskBudget, checkFollowUpBudget } from '../askBudget.service';
import { setThreadStatus } from '../threadStatus.service';
import { createThread, saveThreadMessage } from '../threads.service';
import { wakeTask } from '../taskEngine.service';
import {
  createAsk,
  createRelayAsk,
  recordAskAnswer,
  sendApprovedAskAnswer,
  cancelAsksForTask,
  buildAnswerWakeEvent,
  ensureVerbatimQuote,
  getPendingAsksForUser,
  runPayerFor,
} from '../taskAsks.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockGetTask = getTaskById as jest.MockedFunction<typeof getTaskById>;
const mockOptedOut = isOptedOutFromAsks as jest.MockedFunction<typeof isOptedOutFromAsks>;
const mockPhoneStop = isPhoneOptedOut as jest.MockedFunction<typeof isPhoneOptedOut>;
const mockCheckBudget = checkAskBudget as jest.MockedFunction<typeof checkAskBudget>;
const mockFollowUpBudget = checkFollowUpBudget as jest.MockedFunction<typeof checkFollowUpBudget>;
const mockSetThreadStatus = setThreadStatus as jest.MockedFunction<typeof setThreadStatus>;
const mockCreateThread = createThread as jest.MockedFunction<typeof createThread>;
const mockSaveMessage = saveThreadMessage as jest.MockedFunction<typeof saveThreadMessage>;

function rows(data: unknown[], rowCount = data.length): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount };
}

beforeEach(() => {
  jest.clearAllMocks();
  (matchAnswerRule as jest.Mock).mockResolvedValue(null);
  (sharedRoster as jest.Mock).mockResolvedValue(null);
  mockOptedOut.mockResolvedValue(false);
  mockPhoneStop.mockResolvedValue(false);
  mockCheckBudget.mockResolvedValue({ allowed: true });
  mockFollowUpBudget.mockResolvedValue({ allowed: true });
  // Default: an open task owned by the caller WITH the blanket permission —
  // the P0 gate lets these through; individual tests flip the fields.
  mockGetTask.mockResolvedValue({
    id: 3,
    user_id: 42,
    status: 'open',
    permission_granted: true,
  } as never);
});

function routeAskQueries(opts: {
  member?: { userId: number; name: string; subscriptionStatus?: string } | null;
  /** Has the recipient ever opened Netai (a thread or a search)? Default yes. */
  onNetai?: boolean;
  /** The plan in force on the goal (Ticket 10 Task 21). Default none. */
  plan?: {
    solved_when: string;
    routes: { name: string; status: string }[];
    people_to_involve: { name: string; phone: string; route: string }[];
    never_contact: { name: string; phone?: string }[];
  };
  /** A live ask already runs between this goal and this person — a follow-up. */
  liveThread?: number;
  /**
   * The status of that live ask. Defaults to 'answered', because every test
   * using liveThread was written about a real follow-up — Lika asking Tornike
   * when he was free, HIM ANSWERING, and „12:00" needing somewhere to go.
   * 'sent' is the case the seat found on 18 September: a second message to
   * somebody who has not replied, which is not a new round.
   */
  liveStatus?: 'sent' | 'answered';
  /**
   * How long ago that live ask went out. Two hours by default, because every
   * test written before row 205 is about a LATER message — „one more thing"
   * added to a thread, not the same question fired twice inside one run. The
   * duplicate guard only looks at the first ten minutes.
   */
  liveSecondsAgo?: number;
  /** Who sent that live ask. The caller in these tests, unless a test says otherwise. */
  liveFromUserId?: string;
  sentToday?: number;
  receivedToday?: number;
}): void {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('FROM "UserPhone"'))
      return Promise.resolve(
        rows(
          opts.member
            ? [{ ...opts.member, subscriptionStatus: opts.member.subscriptionStatus ?? 'active' }]
            : [],
        ) as never,
      );
    if (sql.includes(') AS opened'))
      return Promise.resolve(rows([{ opened: opts.onNetai ?? true }]) as never);
    if (sql.includes('plan_approved_at FROM tasks'))
      return Promise.resolve(
        rows(
          opts.plan
            ? [{ plan: opts.plan, plan_version: 1, plan_approved_at: '2026-09-07T20:00:00Z' }]
            : [],
        ) as never,
      );
    // Two separate lookups read the same row: this one decides the thread and
    // whether it is a new round, and `liveWithThisPerson` below exempts a live
    // conversation from the receiving-side brake. They are matched apart
    // because only the first one needs the status.
    if (sql.includes('SELECT ask_thread_id, status'))
      return Promise.resolve(
        rows(
          opts.liveThread
            ? [
                {
                  ask_thread_id: opts.liveThread,
                  status: opts.liveStatus ?? 'answered',
                  from_user_id: opts.liveFromUserId ?? '42',
                  seconds_ago: opts.liveSecondsAgo ?? 7200,
                },
              ]
            : [],
        ) as never,
      );
    if (sql.includes('SELECT ask_thread_id FROM task_asks'))
      return Promise.resolve(
        rows(opts.liveThread ? [{ ask_thread_id: opts.liveThread }] : []) as never,
      );
    // The receiving-side brake (D134): new questions this person got today.
    if (sql.includes('to_user_id = $1 AND is_follow_up = FALSE'))
      return Promise.resolve(rows([{ count: String(opts.receivedToday ?? 0) }]) as never);
    if (sql.includes('COUNT(*)'))
      return Promise.resolve(rows([{ count: String(opts.sentToday ?? 0) }]) as never);
    if (sql.includes('SELECT name FROM "User"'))
      return Promise.resolve(rows([{ name: 'მიშო' }]) as never);
    if (sql.includes('INSERT INTO task_asks')) return Promise.resolve(rows([{ id: 9 }]) as never);
    return Promise.resolve(rows([]) as never);
  });
}

describe('createAsk', () => {
  it('REFUSES without granted permission — the server-side P0 gate (thread 7723)', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' } });
    mockGetTask.mockResolvedValue({
      id: 3,
      user_id: 42,
      status: 'open',
      permission_granted: false,
    } as never);

    const out = await createAsk('42', 3, '+995599111222', 'კითხვა');

    expect(out.sent).toBe(false);
    expect((out as { error: string }).error).toContain('grant_task_permission');
    // Nothing left the building: no thread, no message, no push.
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  /**
   * ROW 249 — THE REFUSAL IS RIGHT AND THE STATE IS A THIRD OF A SECOND STALE.
   *
   * Run d8d74e6d, goal 8402, 22 September, one single model turn:
   *
   *   19:15:24.792  ask_contact            refused — permission is false
   *   19:15:25.092  approve_task_plan      lands 300ms later
   *   19:15:28.382  ask_contact            the retry
   *   19:15:28.384  grant_task_permission  2ms after its own retry
   *
   * `processToolBlocks` runs one turn's tools concurrently because „a single
   * turn's tool_use blocks are independent by construction". This pair is the
   * counterexample. The model then obeyed the old text's last sentence, went
   * back to the owner with a fresh draft for a plan they had already approved,
   * and day one sent it while that card was still on the screen. Two of ten
   * approvals that evening.
   *
   * These hold the ORDER of the three instructions, because the order is the
   * fix: the true case first, the owner last.
   */
  describe('the refusal tells the model what is actually wrong, in order', () => {
    async function refusal(): Promise<string> {
      routeAskQueries({ member: { userId: 7, name: 'გია' } });
      mockGetTask.mockResolvedValue({
        id: 3,
        user_id: 42,
        status: 'open',
        permission_granted: false,
      } as never);
      const out = await createAsk('42', 3, '+995599111222', 'კითხვა');
      return (out as { error: string }).error;
    }

    it('names the same-turn race first, because that is what it usually is', async () => {
      const text = await refusal();

      expect(text).toContain('ამავე სვლაში');
      expect(text).toContain('გაიმეორე ask_contact');
    });

    it('names approve_task_plan, which it never used to', async () => {
      // The old text offered only grant_task_permission. A goal with a plan
      // proposed needs the other door, and the model was never told so here.
      const text = await refusal();

      expect(text).toContain('approve_task_plan');
      expect(text).toContain('grant_task_permission');
    });

    it('puts going back to the owner LAST, and only if they were never asked', async () => {
      const text = await refusal();

      const race = text.indexOf('ამავე სვლაში');
      const voiced = text.indexOf('თანხმობა უკვე ნათქვამი');
      const askThem = text.indexOf('ჰკითხე ერთხელ');
      expect(race).toBeGreaterThanOrEqual(0);
      expect(voiced).toBeGreaterThan(race);
      expect(askThem).toBeGreaterThan(voiced);
    });

    it('tells it not to show a new draft to somebody who has already answered', async () => {
      // This is the sentence the owner saw the consequence of: „since this
      // task is set to ask before anything goes out", under an approved plan.
      const text = await refusal();

      expect(text).toContain('ახალ ტექსტს ნუ');
    });

    /**
     * ⚠️ THIS REFUSAL USED TO SEND THE MODEL INTO A SECOND ONE THAT FORBIDS
     * WHAT THIS ONE ASKS FOR.
     *
     * Found by `scripts/ops/why.sh`, 25 September, which prints what a run did
     * after each no. Of 27 runs refused here in a week, 19 went and called the
     * consent tool and it worked in all 19 — and only 5 ever sent anything.
     * Thirteen were refused again on the retry, eleven of them by
     * `runApprovedAPlan` in chat.service.ts:
     *
     *   „Nothing sent, and nothing is needed from you: you approved the plan
     *    in this same turn, and day one is already starting behind your reply
     *    … Calling this here sends each of them the same question twice."
     *
     * Both guards are right. „Call approve_task_plan and repeat ask_contact"
     * is correct for a GRANT and is the double-send for an APPROVAL, and the
     * old text gave one instruction for both.
     */
    it('does not tell it to repeat the ask after a plan approval', async () => {
      const text = await refusal();
      const approval = text.indexOf('გამოიძახე approve_task_plan — ask_contact აღარ გაიმეორო');

      expect(approval).toBeGreaterThan(0);
      // The grant still DOES want the repeat — that path was never broken, and
      // collapsing the two into „never repeat" would strand every no-plan goal.
      expect(text).toContain('გამოიძახე grant_task_permission — ეს უარი მას გაუსწრო');
      expect(text).toContain('გაიმეორე ask_contact');
    });

    /**
     * The other half of the same fault: the model was told to send, and then
     * told by the next guard not to say it had sent. Saying so here means the
     * run does not have to be refused twice to learn it.
     */
    it('supplies the sentence to write instead, and forbids the past tense', async () => {
      const text = await refusal();

      // „პირველ რაუნდს" and not „პირველ დღეს": the product's name for the
      // plan's first round is also the Georgian for „today", and a refusal is
      // re-read hours later by a run that has no clock (row 208).
      expect(text).toContain('გეგმის პირველ რაუნდს');
      expect(text).not.toContain('დღეს');
      expect(text).toContain('არ თქვა');
    });

    /** And none of the wording moves the wall itself. */
    it('still refuses, and still sends nothing', async () => {
      routeAskQueries({ member: { userId: 7, name: 'გია' } });
      mockGetTask.mockResolvedValue({
        id: 3,
        user_id: 42,
        status: 'open',
        permission_granted: false,
      } as never);

      const out = await createAsk('42', 3, '+995599111222', 'კითხვა');

      expect(out.sent).toBe(false);
      expect(out.reason).toBe('consent_pending');
      expect(mockCreateThread).not.toHaveBeenCalled();
    });
  });

  it('a relay (parentAskId set) bypasses the sender-permission gate by design', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' } });
    mockGetTask.mockResolvedValue(null as never);

    const out = await createAsk('42', 3, '+995599111222', 'კითხვა', 11);

    expect(out.sent).toBe(true);
  });

  it('sends: ask row + recipient thread + opening message', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' } });

    const out = await createAsk('42', 3, '+995599111222', 'BMW-ს კარგი ხელოსანი ხომ არ იცი?');

    expect(out).toEqual({ sent: true, ask_id: 9, to_name: 'გია' });
    // The title carries the question itself, not a generic "კითხვა" — eight
    // asks from one sender must be tellable apart (ticket 3 §6.11).
    expect(mockCreateThread).toHaveBeenCalledWith(
      '7',
      'incoming_ask',
      'მიშო: BMW-ს კარგი ხელოსანი ხომ არ იცი?',
      undefined,
      {
        isTask: true,
        status: 'needs_you',
        // Row 289/290: the recipient's caption is the product's standard line
        // for this status now, not a second Georgian wording of it. „პასუხს
        // ელოდება" and „შენი პასუხი სჭირდება" were two phrasings of one state
        // and only one of them had translations, so the untranslated one had
        // to go. Georgian here because this test's recipient writes Georgian.
        statusLine: 'შენი პასუხი სჭირდება',
      },
    );
    // Plain text on the recipient's phone — no markdown asterisks (§6.3).
    const opening = mockSaveMessage.mock.calls[0][3] as string;
    expect(opening).not.toContain('**');
    // Item 27: declined properly, never the hyphenated „მიშო-ის".
    expect(opening).toContain('მიშოს ასისტენტი გეკითხება');
    // D49: reaching 'sent' arms the ASKER's 3-day debrief for this ask.
    expect(armAskDebrief).toHaveBeenCalledWith('42', 9, 3, 'გია', false);
  });

  it('writes down the conversation the ask was sent FROM (ticket 9 task 20 d)', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' } });

    await createAsk('42', 3, '+995599111222', 'q', undefined, 9412);

    const insert = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO task_asks'),
    ) as [string, unknown[]];
    expect(insert[0]).toContain('origin_thread_id');
    // The sender's thread, NOT the recipient thread the insert also carries.
    expect(insert[1][6]).toBe(9412);
  });

  it('leaves the origin null when an ask has no conversation behind it (a relay)', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' } });

    await createAsk('42', 3, '+995599111222', 'q', 11);

    const insert = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO task_asks'),
    ) as [string, unknown[]];
    expect(insert[1][6]).toBeNull();
  });

  it('refuses a non-member recipient', async () => {
    routeAskQueries({ member: null });

    const out = await createAsk('42', 3, '+995599111222', 'q');

    expect(out.sent).toBe(false);
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  // Ticket 10 Task 25 (b), D123: a non-paying member can answer and help on a
  // paying member's task. Until 7 Sep a lapsed friend could not even be asked.
  it('reaches a lapsed member who has used Netai — paying is not required', async () => {
    routeAskQueries({
      member: { userId: 7, name: 'გია', subscriptionStatus: 'inactive' },
      onNetai: true,
    });

    const out = await createAsk('42', 3, '+995599111222', 'q');

    expect(out.sent).toBe(true);
  });

  // D103 / D121: an old-Ally account that never opened Netai is a target, not
  // a recipient — an ask to it lands in an inbox nobody has ever opened.
  it('refuses an account that has never opened Netai, and points at the invite route', async () => {
    routeAskQueries({
      member: { userId: 7, name: 'გია', subscriptionStatus: 'inactive' },
      onNetai: false,
    });

    const out = await createAsk('42', 3, '+995599111222', 'q');

    expect(out.sent).toBe(false);
    expect((out as { reason?: string }).reason).toBe('recipient_not_on_netai');
    expect((out as { error: string }).error).toContain('invite_contact');
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  // Ticket 10 Task 21 (D119): with an approved plan, consent is the plan's.
  describe('the plan in force', () => {
    const PLAN = {
      solved_when: 'x',
      routes: [{ name: 'ქსელი', status: 'running' }],
      people_to_involve: [{ name: 'გია', phone: '+995 599 111 222', route: 'ქსელი' }],
      never_contact: [{ name: 'ნანა', phone: '+995599999999' }],
    };

    it('a person the plan names is written to', async () => {
      routeAskQueries({ member: { userId: 7, name: 'გია' }, plan: PLAN });
      expect((await createAsk('42', 3, '+995599111222', 'q')).sent).toBe(true);
    });

    it('a person on never_contact is refused on every route — a relay too', async () => {
      routeAskQueries({ member: { userId: 7, name: 'ნანა' }, plan: PLAN });
      const direct = await createAsk('42', 3, '+995599999999', 'q');
      expect((direct as { reason?: string }).reason).toBe('never_contact');
      const relay = await createAsk('42', 3, '+995599999999', 'q', 11);
      expect((relay as { reason?: string }).reason).toBe('never_contact');
      expect(mockCreateThread).not.toHaveBeenCalled();
    });

    it('a person outside the plan is a plan change, with the instruction to propose one', async () => {
      routeAskQueries({ member: { userId: 7, name: 'ბექა' }, plan: PLAN });
      const out = await createAsk('42', 3, '+995599000000', 'q');
      expect((out as { reason?: string }).reason).toBe('outside_plan');
      expect((out as { error: string }).error).toContain('propose_task_plan');
      expect(mockCreateThread).not.toHaveBeenCalled();
    });

    it('a relay is the recipient’s own act — outside_plan does not apply to it', async () => {
      routeAskQueries({ member: { userId: 7, name: 'ბექა' }, plan: PLAN });
      mockGetTask.mockResolvedValue(null as never);
      expect((await createAsk('42', 3, '+995599000000', 'q', 11)).sent).toBe(true);
    });
  });

  it('a live subscription proves Netai use without a second query', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია', subscriptionStatus: 'trialing' } });

    const out = await createAsk('42', 3, '+995599111222', 'q');

    expect(out.sent).toBe(true);
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes(') AS opened'))).toBe(false);
  });

  it('a second message to the same person continues the SAME thread (ticket 9 task 12)', async () => {
    // Lika asked Tornike when he was free, he answered, and „12:00" had
    // nowhere to go. It goes into the conversation it belongs to.
    routeAskQueries({ member: { userId: 7, name: 'გია' }, liveThread: 9413 });

    const out = await createAsk('42', 3, '+995599111222', '12:00');

    expect(out.sent).toBe(true);
    // No new thread in the recipient's list — the message lands in the old one.
    expect(mockCreateThread).not.toHaveBeenCalled();
    expect(mockSaveMessage.mock.calls[0][0]).toBe(9413);
    const insert = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO task_asks'),
    ) as [string, unknown[]];
    expect(insert[1][4]).toBe(9413); // ask_thread_id — the live thread
    expect(insert[1][7]).toBe(true); // is_follow_up
  });

  it('a follow-up puts the badge back on the recipient — a new round is waiting', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' }, liveThread: 9413 });

    await createAsk('42', 3, '+995599111222', '12:00');

    expect(mockSetThreadStatus).toHaveBeenCalledWith('7', 9413, 'needs_you', {
      // Same change as above — the standard line for `needs_you`.
      statusLine: 'შენი პასუხი სჭირდება',
      isTask: true,
    });
  });

  it('a follow-up spends the per-person day budget, never the monthly growth one', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' }, liveThread: 9413 });

    await createAsk('42', 3, '+995599111222', '12:00');

    // A reply to a reply is not outreach: the growth budget is not consulted.
    expect(mockFollowUpBudget).toHaveBeenCalledWith('42', 7, 3);
    expect(mockCheckBudget).not.toHaveBeenCalled();
  });

  it('stops the day’s last message to one person, and says so without blaming them', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' }, liveThread: 9413 });
    mockFollowUpBudget.mockResolvedValue({
      allowed: false,
      reason: 'person_daily_relay_limit_reached',
    });

    const out = await createAsk('42', 3, '+995599111222', 'კიდევ ერთი');

    expect(out.sent).toBe(false);
    expect((out as { reason?: string }).reason).toBe('person_daily_relay_limit_reached');
    // Nothing reached their phone, and the refusal never says they refused.
    expect(mockSaveMessage).not.toHaveBeenCalled();
    expect((out as { error: string }).error).not.toContain('უარი');

    // This used to assert the refusal said „ხვალ" — tomorrow. True about the
    // LIMIT, and row 127 is what a model does with it: on goal 3533 it became
    // „Lika's answer will come tomorrow" to an owner nothing had been sent for.
    // The word is gone and the rule that replaced it is asserted instead.
    expect((out as { error: string }).error).not.toContain('ხვალ ისევ შესაძლებელი');
    expect((out as { error: string }).error).toContain('არასოდეს დაჰპირდე პასუხს');
    expect((out as { error: string }).error).toContain('მფლობელის ლიმიტი არ არის');
  });

  it('enforces the daily anti-runaway ceiling', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' }, sentToday: 20 });

    const out = await createAsk('42', 3, '+995599111222', 'q');

    expect(out.sent).toBe(false);
    expect((out as { error: string }).error).toContain('ლიმიტი');
  });

  it('REFUSES a person who asked not to be contacted — any sender, any task (ticket 4 item 00)', async () => {
    routeAskQueries({ member: { userId: 7, name: 'ლიკა' } });
    mockOptedOut.mockResolvedValue(true);

    const out = await createAsk('42', 3, '+995599111222', 'კითხვა');

    expect(out.sent).toBe(false);
    expect((out as { error: string }).error).toContain('აღარ მიეღო');
    // The asker hears the truth, not a technical excuse.
    expect((out as { error: string }).error).toContain('ტექნიკური შეფერხება');
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it('a RELAY cannot route around the opt-out either — it is still a message on their phone', async () => {
    routeAskQueries({ member: { userId: 7, name: 'ლიკა' } });
    mockOptedOut.mockResolvedValue(true);

    const out = await createAsk('42', 3, '+995599111222', 'კითხვა', 11);

    expect(out.sent).toBe(false);
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it('strips a greeting from the thread TITLE while the message keeps the sender wording', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' } });

    await createAsk('42', 3, '+995599111222', 'გამარჯობა ლიკა! გყავს კარგი სტომატოლოგი თბილისში?');

    // Every ask opened "გამარჯობა ლიკა!", so every row in her list read the
    // same (ticket 4 item 3).
    expect(mockCreateThread).toHaveBeenCalledWith(
      '7',
      'incoming_ask',
      'მიშო: გყავს კარგი სტომატოლოგი თბილისში?',
      undefined,
      expect.anything(),
    );
    // …but the question itself is delivered exactly as written.
    expect(mockSaveMessage.mock.calls[0][3]).toContain('გამარჯობა ლიკა!');
  });

  it('refuses asking yourself', async () => {
    routeAskQueries({ member: { userId: 42, name: 'მიშო' } });

    const out = await createAsk('42', 3, '+995599111222', 'q');

    expect(out.sent).toBe(false);
  });
});

describe('createAsk — engine T10, growth-ask budget gate', () => {
  it('blocks a send when the per-conversation floor is reached', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' } });
    mockCheckBudget.mockResolvedValue({ allowed: false, reason: 'conversation_limit_reached' });

    const out = await createAsk('42', 3, '+995599111222', 'q', undefined, 555);

    expect(out.sent).toBe(false);
    expect((out as { reason?: string }).reason).toBe('conversation_ask_limit_reached');
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it('blocks a send when the monthly budget is exhausted', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' } });
    mockCheckBudget.mockResolvedValue({ allowed: false, reason: 'monthly_budget_reached' });

    const out = await createAsk('42', 3, '+995599111222', 'q');

    expect(out.sent).toBe(false);
    expect((out as { reason?: string }).reason).toBe('monthly_ask_budget_reached');
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it('passes the caller thread through so the gate can enforce the per-conversation floor', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' } });

    await createAsk('42', 3, '+995599111222', 'q', undefined, 555);

    expect(mockCheckBudget).toHaveBeenCalledWith('42', 555);
  });

  it('a relay bypasses the budget gate too — same choke point as the permission gate', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' } });
    mockGetTask.mockResolvedValue(null as never);

    const out = await createAsk('42', 3, '+995599111222', 'q', 11);

    expect(out.sent).toBe(true);
    expect(mockCheckBudget).not.toHaveBeenCalled();
  });
});

describe('createRelayAsk', () => {
  const parentRow = {
    id: 11,
    task_id: 3,
    to_user_id: 42,
    question: 'BMW-ს ხელოსანი?',
    parent_ask_id: null,
  };

  function routeRelayQueries(opts: {
    parent?: typeof parentRow | null;
    aliasMatches?: { digits: string }[];
    member?: { userId: number; name: string; subscriptionStatus?: string } | null;
  }): void {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('parent_ask_id FROM task_asks'))
        return Promise.resolve(rows(opts.parent ? [opts.parent] : []) as never);
      if (sql.includes('FROM "UserAlias" ua WHERE'))
        return Promise.resolve(rows(opts.aliasMatches ?? []) as never);
      if (sql.includes('FROM "UserPhone"'))
        return Promise.resolve(
          rows(
            opts.member
              ? [
                  {
                    ...opts.member,
                    subscriptionStatus: opts.member.subscriptionStatus ?? 'active',
                  },
                ]
              : [],
          ) as never,
        );
      if (sql.includes('SELECT id FROM task_asks')) return Promise.resolve(rows([]) as never);
      if (sql.includes('COUNT(*)')) return Promise.resolve(rows([{ count: '0' }]) as never);
      if (sql.includes('SELECT name FROM "User"'))
        return Promise.resolve(rows([{ name: 'ლიკა' }]) as never);
      if (sql.includes('INSERT INTO task_asks'))
        return Promise.resolve(rows([{ id: 12 }]) as never);
      return Promise.resolve(rows([]) as never);
    });
  }

  const RELAYED = 'თორნიკე გთხოვს, შეხვდე ნინიას — მარკეტინგის პარტნიორს ეძებს.';

  it('resolves a NAME to the one matching contact server-side and relays', async () => {
    routeRelayQueries({
      parent: parentRow,
      aliasMatches: [{ digits: '995599333444' }],
      member: { userId: 8, name: 'სალომე' },
    });

    const out = await createRelayAsk('42', 11, 'სალომე ბერიძე', RELAYED);

    // Row 210: a successful relay now carries the reminder that the bridge's
    // OWN answer has still not been sent. It is asserted as a field rather
    // than folded into the equality so that the reminder's wording can change
    // without this test, which is about resolution, having an opinion on it.
    expect(out.sent).toBe(true);
    expect(out).toMatchObject({ sent: true, ask_id: 12, to_name: 'სალომე' });
    expect((out as { note?: string }).note).toContain('send_answer_to_asker');
  });

  /**
   * Ticket 19 G10, the founder's ruling of 15 September: the words the named
   * person reads are written by the BRIDGE's assistant, naming who is asking
   * and why — "in that case it should be Tornike's assistant to Erekle".
   *
   * It used to fall back to the PARENT's wording, which was written TO the
   * bridge by somebody the named person has never heard of. Eke would have
   * received Tornike's name wrapped around Ninia's question to Tornike, with
   * no Ninia in it and no reason for the request.
   */
  it('refuses a relay that carries no words of its own', async () => {
    routeRelayQueries({
      parent: parentRow,
      aliasMatches: [{ digits: '995599333444' }],
      member: { userId: 8, name: 'სალომე' },
    });

    const out = await createRelayAsk('42', 11, 'სალომე ბერიძე');

    expect(out.sent).toBe(false);
    const error = (out as { error: string }).error;
    // The refusal says what to write, so the next call carries it.
    expect(error).toContain('who is ');
    expect(error).toContain('why');
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it('refuses whitespace as words, too', async () => {
    routeRelayQueries({
      parent: parentRow,
      aliasMatches: [{ digits: '995599333444' }],
      member: { userId: 8, name: 'სალომე' },
    });

    expect((await createRelayAsk('42', 11, 'სალომე ბერიძე', '   ')).sent).toBe(false);
  });

  it('an ambiguous name asks for the full name — never a candidate list, never counts', async () => {
    routeRelayQueries({
      parent: parentRow,
      aliasMatches: [{ digits: '995599333444' }, { digits: '995599555666' }],
    });

    const out = await createRelayAsk('42', 11, 'სალომე', RELAYED);

    expect(out.sent).toBe(false);
    const error = (out as { error: string }).error;
    expect(error).toContain('რამდენიმე კონტაქტი ემთხვევა');
    expect(error).toContain('კანდიდატები ნუ ჩამოთვლი');
    // Row 210. This asserted „უკვე გადაეცა" — that the answer had already
    // reached the asker. D48 removed the path that made that true, and the
    // sentence went on being told to the model until an introduction was lost
    // to it. What must survive is the 11 August protection (a relay failure is
    // not a lost answer), and that is what is asserted now.
    expect(error).not.toContain('უკვე გადაეცა');
    expect(error).toContain('არაფერი დაკარგულა');
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it('a no-match name gives the model an OUT when the user never asked to forward (blocker 2)', async () => {
    routeRelayQueries({ parent: parentRow, aliasMatches: [] });

    const out = await createRelayAsk('42', 11, 'თვითონ', RELAYED);

    expect(out.sent).toBe(false);
    const error = (out as { error: string }).error;
    expect(error).toContain('ვერ მოიძებნა');
    // The recipient must never be told their answer failed, and must never be
    // asked to spell her own phonebook (ticket 4 items 0A/0AA/0C.1b). What
    // this asserted — that the name „already reached the asker" — was the
    // removed auto-capture path talking; the name reaches him inside the
    // answer the model still owes, which is what the text says now.
    expect(error).not.toContain('უკვე მივიდა');
    expect(error).toContain('შენს გასაგზავნ პასუხში');
    expect(error).toContain('ორთოგრაფია არ ჰკითხო');
    // Resolution errors carry their own instructions — the neutral-close
    // suffix ("ამის გადაცემა ვერ მოხერხდა") must NOT ride on them: it made a
    // never-requested relay read as a malfunction.
    expect(error).not.toContain('ამის გადაცემა ამ ეტაპზე ვერ მოხერხდა');
  });

  it('every refusal carries the neutral-close rule (no "system error", no direct contact)', async () => {
    routeRelayQueries({ parent: { ...parentRow, parent_ask_id: 5 } });

    const out = await createRelayAsk('42', 11, 'სალომე ბერიძე', RELAYED);

    expect(out.sent).toBe(false);
    expect((out as { error: string }).error).toContain('ჯაჭვი');
    expect((out as { error: string }).error).toContain('სისტემური შეცდომა');
    expect((out as { error: string }).error).toContain('არასოდეს ურჩიო');
    // Even a genuine relay failure must leave the answer's fate unconfused —
    // but it may no longer claim the answer „got through", because since D48
    // nothing gets through until send_answer_to_asker is called.
    expect((out as { error: string }).error).not.toContain('უკვე გადაეცა');
    expect((out as { error: string }).error).toContain('send_answer_to_asker');
  });

  /**
   * This test used to assert that the wrong caller is told „Ask not found."
   * The refusal is right — only an ask's recipient may forward it — and the
   * sentence was false, which is a different thing and a costly one.
   *
   * 16 September, goal 3540. Ninia asked to reach Misho; ask 1849 went to
   * Tornike as the bridge. At 12:08:36 her own thread called relay_ask with
   * ask_id 1849, was told the ask was not found, and at 12:11:13 told her that
   * writing to Misho is impossible. It is not. A real user was given an untrue
   * answer, and the test above was holding the sentence that produced it.
   */
  it('only the ask RECIPIENT can relay it', async () => {
    routeRelayQueries({ parent: { ...parentRow, to_user_id: 99 } });

    const out = await createRelayAsk('42', 11, 'სალომე ბერიძე', RELAYED);

    expect(out.sent).toBe(false);
    const { error } = out as { error: string };
    // What is true: the ask exists and belongs to somebody else.
    expect(error).toContain('სხვას მიუვიდა');
    // What must not be concluded from it, because that is what happened.
    expect(error).toContain('შეუძლებელია');
    expect(error).toContain('არ უთხრა');
    expect(error).not.toContain('Ask not found.');
    // It carries its own instruction, so the neutral close — „your answer
    // reached the asker" — must not ride along: nothing was answered here.
    expect(error).not.toContain('უკვე გადაეცა');
  });

  it('a genuinely missing ask is still told it is missing', async () => {
    routeRelayQueries({ parent: null });

    const out = await createRelayAsk('42', 11, 'სალომე ბერიძე', RELAYED);

    expect(out.sent).toBe(false);
    expect((out as { error: string }).error).toContain('Ask not found.');
  });

  it('a dictated phone number skips the name lookup and goes straight through', async () => {
    routeRelayQueries({ parent: parentRow, member: { userId: 8, name: 'სალომე' } });

    const out = await createRelayAsk('42', 11, '+995 599 333 444', RELAYED);

    expect(out.sent).toBe(true);
    const aliasLookups = mockQuery.mock.calls.filter(([sql]) =>
      (sql as string).includes('FROM "UserAlias"'),
    );
    expect(aliasLookups).toHaveLength(0);
  });
});

describe('sendApprovedAskAnswer — Task 1(c), the ONLY outbound channel (D48)', () => {
  const mockWakeTask = wakeTask as jest.MockedFunction<typeof wakeTask>;

  function routeApprovedAnswerQueries(opts: {
    ask?: { to_user_id: number; status: string } | null;
    captured?: boolean;
  }): void {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT to_user_id, status'))
        return Promise.resolve(rows(opts.ask ? [opts.ask] : []) as never);
      if (sql.includes('UPDATE task_asks') && sql.includes('SET answer'))
        return Promise.resolve(
          rows(
            opts.captured === false ? [] : [{ id: 77, task_id: 3, answer: 'დამტკიცებული ტექსტი' }],
          ) as never,
        );
      if (sql.includes('SELECT u.name AS from_name'))
        return Promise.resolve(rows([{ from_name: 'გია' }]) as never);
      return Promise.resolve(rows([]) as never);
    });
  }

  /** Let every queued microtask run — the wake now finishes after the return. */
  const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

  it('records the approved text and wakes the asker with EXACTLY that text', async () => {
    routeApprovedAnswerQueries({ ask: { to_user_id: 7, status: 'sent' } });
    mockWakeTask.mockResolvedValue('woken');

    const out = await sendApprovedAskAnswer('7', 55, 'დამტკიცებული ტექსტი');
    await settle();

    expect(out).toEqual({ sent: true });
    expect(mockWakeTask).toHaveBeenCalledWith(3, expect.stringContaining('დამტკიცებული ტექსტი'), {
      text: 'დამტკიცებული ტექსტი',
      who: 'გია',
    });
    // Delivered wake gets its marker so the sweep does not re-deliver.
    const markCall = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('wake_delivered_at = NOW()'),
    );
    expect(markCall?.[1]).toEqual([77]);
  });

  /**
   * AND THE HELPER IS NOT MADE TO WAIT FOR IT.
   *
   * `wakeTask` is a whole run on the ASKER's side — model, tools, reply — and
   * it used to be awaited inside the tool call the HELPER's phone is waiting
   * on. Measured on `tool_call_log`: p50 30,062 ms on 23 September, 32,351 on
   * the 22nd, worst 53,167. Half a minute of spinner after pressing „send",
   * for the one act in this product that is pure generosity.
   *
   * This test fails on that version: it holds the wake unresolved and requires
   * „sent" to have come back anyway.
   */
  it('returns before the asker’s run has finished', async () => {
    routeApprovedAnswerQueries({ ask: { to_user_id: 7, status: 'sent' } });
    let finishTheWake: (value: 'woken') => void = () => {};
    mockWakeTask.mockReturnValue(
      new Promise<'woken'>((resolve) => {
        finishTheWake = resolve;
      }),
    );

    const out = await sendApprovedAskAnswer('7', 55, 'დამტკიცებული ტექსტი');
    await settle();

    // The asker's run is still going, and the helper has already been told.
    expect(out).toEqual({ sent: true });
    expect(
      mockQuery.mock.calls.find(([sql]) => (sql as string).includes('wake_delivered_at = NOW()')),
    ).toBeUndefined();

    finishTheWake('woken');
    await settle();

    expect(
      mockQuery.mock.calls.find(([sql]) => (sql as string).includes('wake_delivered_at = NOW()')),
    ).toBeDefined();
  });

  /**
   * ROW 233 — THE PERSON WHO ANSWERED WAS STILL BEING ASKED.
   *
   * Thread 21509, account 171940, read from the live table today:
   *
   *   09:19:14  ask 3664 sent, thread born `needs_you` / „Needs your answer"
   *   09:48:45  he ANSWERED it
   *   09:49:23  the thread's last update … still `needs_you`
   *
   * And it still said it two hours later. Thread 21510, whose ask the
   * recipient's opt-out CANCELLED, read `done` — so the cancel path cleared
   * the badge and the answer path did not.
   *
   * The close existed in `answerAutomatically` and nowhere else, so a person
   * who answered by TYPING — every ordinary answer — kept a chat asking them
   * for something they had already given.
   */
  it('stops asking the person who has just answered', async () => {
    routeApprovedAnswerQueries({ ask: { to_user_id: 7, status: 'sent' } });
    mockWakeTask.mockResolvedValue('woken');

    await sendApprovedAskAnswer('7', 55, 'დამტკიცებული ტექსტი');

    expect(mockSetThreadStatus).toHaveBeenCalledWith('7', 55, 'done', { isTask: true });
  });

  /**
   * A second message appending to an answer must not reopen a thread that is
   * finished — so the close does not hang off `firstAnswer`, and closing a
   * closed thread costs one idempotent write.
   */
  it('and keeps it closed when a later message appends to the answer', async () => {
    routeApprovedAnswerQueries({ ask: { to_user_id: 7, status: 'answered' } });
    mockWakeTask.mockResolvedValue('woken');

    await sendApprovedAskAnswer('7', 55, 'და კიდევ ერთი რამ');

    expect(mockSetThreadStatus).toHaveBeenCalledWith('7', 55, 'done', { isTask: true });
  });

  it('refuses when the thread carries no ask, or the ask is addressed to someone else', async () => {
    routeApprovedAnswerQueries({ ask: { to_user_id: 99, status: 'sent' } });

    const out = await sendApprovedAskAnswer('7', 55, 'ტექსტი');

    expect(out.sent).toBe(false);
    expect(mockWakeTask).not.toHaveBeenCalled();
    // Nothing was written.
    const updates = mockQuery.mock.calls.filter(([sql]) =>
      (sql as string).includes('UPDATE task_asks'),
    );
    expect(updates).toHaveLength(0);
  });

  it('refuses a cancelled ask — a closed question can never receive an answer', async () => {
    routeApprovedAnswerQueries({ ask: { to_user_id: 7, status: 'cancelled' } });

    const out = await sendApprovedAskAnswer('7', 55, 'ტექსტი');

    expect(out.sent).toBe(false);
    expect(mockWakeTask).not.toHaveBeenCalled();
  });

  it('still reports sent when the instant wake fails — the 5-minute sweep is the backstop', async () => {
    routeApprovedAnswerQueries({ ask: { to_user_id: 7, status: 'sent' } });
    mockWakeTask.mockRejectedValue(new Error('engine busy'));

    const out = await sendApprovedAskAnswer('7', 55, 'დამტკიცებული ტექსტი');

    expect(out).toEqual({ sent: true });
    // No delivery marker — the sweep must still see it as unwoken.
    const markCall = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('wake_delivered_at = NOW()'),
    );
    expect(markCall).toBeUndefined();
  });
});

describe('recordAskAnswer', () => {
  it('captures the FIRST reply and reports which task to wake', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('UPDATE task_asks'))
        return Promise.resolve(
          rows([{ id: 77, task_id: 3, answer: 'ბიძაშვილი აკეთებს BMW-ებს' }]) as never,
        );
      return Promise.resolve(rows([{ from_name: 'გია' }]) as never);
    });

    const out = await recordAskAnswer(55, 'ბიძაშვილი აკეთებს BMW-ებს');

    // The verbatim scrubbed text + ask id ride back for the wake event and
    // its delivery marker (ticket 3 §5, ticket 4 blocker 1). Row 233 adds the
    // thread: the badge that has to stop asking belongs to the answer, not to
    // whichever caller happened to remember it.
    expect(out).toEqual({
      askId: 77,
      taskId: 3,
      askThreadId: 55,
      firstAnswer: true,
      answer: 'ბიძაშვილი აკეთებს BMW-ებს',
      fromName: 'გია',
    });
  });

  it('answers the LATEST round, not the first — one thread now carries several', async () => {
    // Ticket 9 task 12: „12:00" is round two's answer. Without the ordering,
    // one UPDATE would have written it onto every round on the thread at once.
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('UPDATE task_asks'))
        return Promise.resolve(rows([{ id: 78, task_id: 3, answer: '12:00' }]) as never);
      return Promise.resolve(rows([{ from_name: 'გია' }]) as never);
    });

    const out = await recordAskAnswer(55, '12:00');

    expect(out?.askId).toBe(78);
    expect(out?.firstAnswer).toBe(true);
    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('ORDER BY id DESC LIMIT 1');
  });

  it('a second message inside one round appends and does not re-wake the asker', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('UPDATE task_asks'))
        return Promise.resolve(
          rows([{ id: 78, task_id: 3, answer: 'დიახ\nდა კიდევ ერთი რამ' }]) as never,
        );
      return Promise.resolve(rows([{ from_name: 'გია' }]) as never);
    });

    const out = await recordAskAnswer(55, 'და კიდევ ერთი რამ');

    expect(out?.firstAnswer).toBe(false);
  });

  it('returns null when the thread carries no live ask', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    expect(await recordAskAnswer(55, 'hello')).toBeNull();
  });
});

describe('buildAnswerWakeEvent', () => {
  it('survives double quotes in the answer — tag-delimited, never quote-wrapped (blocker 3)', () => {
    const event = buildAnswerWakeEvent('მან თქვა "არა" და წავიდა');

    expect(event).toContain('<answer>\nმან თქვა "არა" და წავიდა\n</answer>');
    // The old form wrapped the answer in its own quotes — thread 8201 got a
    // raw fragment when the answer itself contained one.
    expect(event).not.toContain('ტექსტია: "');
    expect(event).toContain('სიტყვასიტყვით');
  });
});

describe('ensureVerbatimQuote', () => {
  const ANSWER = '12%-დან იწყება, სჭირდება ამონაწერი.';

  it('leaves the reply alone when the answer is already quoted', () => {
    const reply = `ნინომ გიპასუხა: „${ANSWER}" გინდა შევადაროთ?`;

    expect(ensureVerbatimQuote(reply, { text: ANSWER, who: 'ნინო კახიძე' })).toBe(reply);
  });

  it('matches across whitespace reflow (newlines vs spaces)', () => {
    const reply = 'პასუხი:\n12%-დან იწყება,\nსჭირდება ამონაწერი.\nსხვა რამ?';

    expect(ensureVerbatimQuote(reply, { text: ANSWER, who: 'ნინო' })).toBe(reply);
  });

  it('PREPENDS the quote with attribution when the model paraphrased it away (N-01, thread 9835)', () => {
    const reply = 'ეს საბაზისო პირობებია. გინდათ სხვა ბანკიდანაც შევადაროთ?';

    const out = ensureVerbatimQuote(reply, { text: ANSWER, who: 'ნინო კახიძე' });

    expect(out).toBe(`„${ANSWER}" — ნინო კახიძე\n\n${reply}`);
  });

  it('prepends without attribution when the responder is unnamed', () => {
    const out = ensureVerbatimQuote('პარაფრაზი.', { text: ANSWER, who: null });

    expect(out).toBe(`„${ANSWER}"\n\nპარაფრაზი.`);
  });

  it('does nothing for an empty answer', () => {
    expect(ensureVerbatimQuote('პასუხი.', { text: '   ', who: 'ვიღაც' })).toBe('პასუხი.');
  });
});

describe('getPendingAsksForUser', () => {
  it("queries task_asks directly, scoped to this user as recipient and status 'sent' — live-caught: check_my_inbox never queried this table at all, only introduction_requests, so two real waiting questions (ids 892, 925) never surfaced", async () => {
    mockQuery.mockResolvedValue(
      rows([
        {
          ask_id: 892,
          from_name: 'Giorgi Turashvili',
          question: 'IT მომსახურება',
          created_at: '2026-08-24T11:37:13.277Z',
        },
      ]) as never,
    );

    const out = await getPendingAsksForUser('501');

    expect(out).toEqual([
      {
        ask_id: 892,
        from_name: 'Giorgi Turashvili',
        question: 'IT მომსახურება',
        created_at: '2026-08-24T11:37:13.277Z',
      },
    ]);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('to_user_id = $1');
    expect(sql).toContain("status = 'sent'");
    expect(params).toEqual(['501']);
  });
});

describe('cancelAsksForTask', () => {
  it('cancels sent asks and tells each recipient honestly', async () => {
    mockQuery.mockResolvedValue(
      rows([
        { ask_thread_id: 61, to_user_id: 7 },
        { ask_thread_id: 62, to_user_id: 8 },
      ]) as never,
    );

    await cancelAsksForTask(3);

    expect(mockSaveMessage).toHaveBeenCalledTimes(2);
    expect(mockSaveMessage).toHaveBeenCalledWith(
      61,
      7,
      'assistant',
      expect.stringContaining('აღარ'),
    );
  });
});

// Ticket 10 Task 22 (D120): the recipient's standing rule answers a first
// question of its kind on its own — the ask row says so, the recipient is told.
describe('the answer rule approved once', () => {
  const RULE = {
    id: 9,
    user_id: 7,
    kind: 'ვინ არის კარგი BMW-ს ხელოსანი',
    sample_question: 'BMW-ს კარგი ხელოსანი ხომ არ იცი?',
    answer: 'ლევანი ჯანელიძე, დიდუბეში',
    active: true,
    uses: 0,
    last_used_at: null,
    created_at: 'x',
  };

  it('answers automatically, marks the row, tells the recipient, wakes the asker', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' } });
    (matchAnswerRule as jest.Mock).mockResolvedValue(RULE);
    // recordAskAnswer's UPDATE … RETURNING and the from_name read.
    const base = mockQuery.getMockImplementation()!;
    mockQuery.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('SET answer = CASE'))
        return Promise.resolve(rows([{ id: 9, task_id: 3, answer: RULE.answer }]) as never);
      if (sql.includes('AS from_name'))
        return Promise.resolve(rows([{ from_name: 'გია' }]) as never);
      return base(sql, params);
    });

    const out = await createAsk('42', 3, '+995599111222', 'BMW-ს ხელოსანი ხომ არ იცი?');

    expect(out.sent).toBe(true);
    expect((out as { answered_automatically?: boolean }).answered_automatically).toBe(true);
    const marked = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('SET automatic = TRUE'),
    );
    expect(marked?.[1]).toEqual([9, 9]);
    const told = mockSaveMessage.mock.calls.map((c) => String(c[3]));
    expect(told.some((t) => t.includes('ავტომატურად ვუპასუხე') && t.includes(RULE.answer))).toBe(
      true,
    );
    expect(wakeTask).toHaveBeenCalled();
  });

  it('a follow-up inside a live conversation is never automatic', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' }, liveThread: 9413 });
    (matchAnswerRule as jest.Mock).mockResolvedValue(RULE);

    const out = await createAsk('42', 3, '+995599111222', 'BMW-ს ხელოსანი ხომ არ იცი?');

    expect((out as { answered_automatically?: boolean }).answered_automatically).toBeUndefined();
    expect(matchAnswerRule).not.toHaveBeenCalled();
  });

  it('the second yes on the confirm turn saves the rule from the ask’s own question', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT to_user_id, status, question'))
        return Promise.resolve(
          rows([
            { to_user_id: 7, status: 'sent', question: 'BMW-ს კარგი ხელოსანი ხომ არ იცი?' },
          ]) as never,
        );
      if (sql.includes('SET answer = CASE'))
        return Promise.resolve(rows([{ id: 9, task_id: 3, answer: 'ლევანი' }]) as never);
      if (sql.includes('AS from_name'))
        return Promise.resolve(rows([{ from_name: 'გია' }]) as never);
      if (sql.includes('SELECT from_user_id'))
        return Promise.resolve(rows([{ from_user_id: 42 }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    const out = await sendApprovedAskAnswer('7', 55, 'ლევანი', { kind: 'BMW-ს ხელოსანი' });

    expect(out).toEqual({ sent: true, rule_saved: true });
    expect(saveAnswerRule).toHaveBeenCalledWith(
      '7',
      'BMW-ს ხელოსანი',
      'BMW-ს კარგი ხელოსანი ხომ არ იცი?',
      'ლევანი',
    );
  });
});

// Ticket 10 Task 23 (D121, D57): two members of one network who never saved
// each other's number — the recipient is told a fellow member is asking.
describe('an ask between two roster members', () => {
  it('names the shared network in the opening line', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' } });
    (sharedRoster as jest.Mock).mockResolvedValue('Axel');

    await createAsk('42', 3, '+995599111222', 'ინვესტორს ვეძებ სიდ რაუნდისთვის');

    const opening = mockSaveMessage.mock.calls[0][3] as string;
    expect(opening).toContain('Axel-ის წევრი, როგორც შენ');
    expect(sharedRoster).toHaveBeenCalledWith('42', '7');
  });

  it('says nothing about a network the two do not share', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' } });

    await createAsk('42', 3, '+995599111222', 'q');

    const opening = mockSaveMessage.mock.calls[0][3] as string;
    expect(opening).not.toContain('წევრი');
  });
});

// Ticket 10 Task 25 (a), D123: the original requester pays for the whole
// chain. Every ask row carries the account it started from, and a run on an
// incoming-ask thread is charged to that account, never to the helper.
describe('who pays for a chain (origin_user_id)', () => {
  it('a direct ask starts its chain with the sender', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' } });

    await createAsk('42', 3, '+995599111222', 'q');

    const insert = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO task_asks'),
    ) as [string, unknown[]];
    expect(insert[0]).toContain('origin_user_id');
    expect(insert[1][8]).toBe(42);
  });

  it("a relay inherits its parent's origin — the helper who forwards is never the payer", async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' } });
    const base = mockQuery.getMockImplementation() as (sql: string) => Promise<unknown>;
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT origin_user_id, from_user_id FROM task_asks'))
        return Promise.resolve(rows([{ origin_user_id: 5, from_user_id: 42 }]) as never);
      return base(sql) as never;
    });

    await createAsk('42', 3, '+995599111222', 'q', 11);

    const insert = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO task_asks'),
    ) as [string, unknown[]];
    expect(insert[1][8]).toBe(5);
  });

  it("a relay of a pre-124 parent falls back to the parent's sender", async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' } });
    const base = mockQuery.getMockImplementation() as (sql: string) => Promise<unknown>;
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT origin_user_id, from_user_id FROM task_asks'))
        return Promise.resolve(rows([{ origin_user_id: null, from_user_id: 9 }]) as never);
      return base(sql) as never;
    });

    await createAsk('42', 3, '+995599111222', 'q', 11);

    const insert = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO task_asks'),
    ) as [string, unknown[]];
    expect(insert[1][8]).toBe(9);
  });
});

describe('runPayerFor', () => {
  it('charges the chain origin for a run on an incoming-ask thread', async () => {
    mockQuery.mockResolvedValue(rows([{ origin_user_id: 5 }]) as never);

    expect(await runPayerFor('7', 55, 'incoming_ask')).toBe('5');
    expect(mockQuery.mock.calls[0][1]).toEqual([55]);
  });

  it('charges the user on every other thread without reading the database', async () => {
    expect(await runPayerFor('7', 55, 'regular')).toBe('7');
    expect(await runPayerFor('7', 55, undefined)).toBe('7');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('falls back to the user when the ask row is missing or predates the column', async () => {
    mockQuery.mockResolvedValueOnce(rows([]) as never);
    expect(await runPayerFor('7', 55, 'incoming_ask')).toBe('7');

    mockQuery.mockResolvedValueOnce(rows([{ origin_user_id: null }]) as never);
    expect(await runPayerFor('7', 55, 'incoming_ask')).toBe('7');
  });
});

// D134 (8 Sep): the brake moved to the receiving side — one person's phone
// takes at most two new questions a day from everyone together.
describe('the receiving-side brake', () => {
  it('refuses a new question to a person who already got two today, and says it is not their choice', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' }, receivedToday: 2 });

    const out = await createAsk('42', 3, '+995599111222', 'q');

    expect(out.sent).toBe(false);
    expect((out as { reason: string }).reason).toBe('recipient_daily_limit_reached');
    expect((out as { error: string }).error).toContain('ამ ადამიანის გადაწყვეტილება არ არის');
    expect(mockCreateThread).not.toHaveBeenCalled();

    // Row 127, all three halves. The owner on goal 3533 read „the daily limit
    // ran out" beside her own 1,433 credits and took it for her quota; goal
    // 3539 hit this same brake twice and simply stopped.
    const { error } = out as { error: string };
    expect(error).toContain('მფლობელის ლიმიტი არ არის');
    expect(error).toContain('კრედიტებს');
    expect(error).toContain('ამავე გაშვებაში გააგრძელე');
    expect(error).toContain('მეორე წრე');
    expect(error).toContain('არასოდეს დაჰპირდე პასუხს');
  });

  it('row 127 — the SENDER-side cap says whose it is and does not stop the goal', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' }, sentToday: 20 });

    const out = await createAsk('42', 3, '+995599111222', 'q');

    expect(out.sent).toBe(false);
    const { error } = out as { error: string };
    // The literal sentence the owner saw and read as her own balance.
    expect(error).not.toContain('დღევანდელი მიწერების ლიმიტი ამოიწურა');
    expect(error).toContain('მფლობელის ლიმიტი არ არის');
    expect(error).toContain('ამავე გაშვებაში გააგრძელე');
    expect(error).toContain('არასოდეს დაჰპირდე პასუხს');
  });

  it('a live conversation with this person continues past the brake — it is not a new question', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' }, receivedToday: 5, liveThread: 9413 });

    const out = await createAsk('42', 3, '+995599111222', '12:00');

    expect(out.sent).toBe(true);
  });
});

/**
 * Ticket 20 row 115 — the same answer stored five times.
 *
 * Ask 1783, 16 September 08:43:56–08:44:02: Ninia's „კი" arrived five times in
 * six seconds. Five runs, five „გაიგზავნა" replies, and the stored answer
 * became „კი" five times over joined by newlines — which is what the asker's
 * goal was then woken with.
 *
 * The append window itself is right and stays: somebody who adds a second name
 * after their first answer must have it carried. What is wrong is appending
 * text that is already there word for word.
 */
describe('Ticket 20 row 115 — an identical line does not join the answer twice', () => {
  function sqlOfUpdate(): string {
    const call = mockQuery.mock.calls.find((c) => (c[0] as string).includes('UPDATE task_asks'));
    return (call as [string, unknown[]])[0];
  }

  beforeEach(() => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('UPDATE task_asks')) {
        return Promise.resolve(rows([{ id: 1783, task_id: 3400, answer: 'კი' }]) as never);
      }
      return Promise.resolve(rows([{ from_name: 'ნინია' }]) as never);
    });
  });

  it('appends only a line the answer does not already hold', async () => {
    await recordAskAnswer(15478, 'კი');

    const sql = sqlOfUpdate();
    // The newline in the SQL is a real one (a template literal), so the
    // assertion is on the shape rather than on the escape.
    expect(sql).toContain('NOT ($2 = ANY(string_to_array(answer,');
  });

  it('still appends inside the window — the window is not what was wrong', async () => {
    await recordAskAnswer(15478, 'ასევე ნინო ბერიძე');
    expect(sqlOfUpdate()).toContain('wake_delivered_at IS NULL');
    expect(sqlOfUpdate()).toContain('THEN answer ||');
  });

  it('compares whole LINES, not a LIKE — nothing in a person’s words needs escaping', async () => {
    await recordAskAnswer(15478, '50%_of_them');
    const sql = sqlOfUpdate();
    expect(sql).not.toContain('LIKE');
    expect(sql).toContain('string_to_array');
  });
});

/**
 * Ticket 20 row 150 — the requester pays the whole chain; a helper pays
 * nothing (D133).
 *
 * runPayerFor covered incoming_ask and nothing else, and the other two helper
 * threads quietly charged the helper. Read from the live ledger over fourteen
 * days, the charged account was the thread's own owner on every one of them:
 *
 *   incoming_ask      $3.84   the chain origin pays — correct since D123
 *   campaign_invite   $0.23   the person asked to invite somebody pays
 *   incoming_request  $0.08   the mediator pays for a stranger's request
 */
describe('row 150 — who pays on a thread the helper did not start', () => {
  it('an introduction request is paid by the REQUESTER, not the mediator', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('introduction_requests'))
        return Promise.resolve(rows([{ requester_user_id: 777 }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    expect(await runPayerFor('42', 9, 'incoming_request')).toBe('777');
  });

  /**
   * This test asserted that a campaign invite is paid by NOBODY, on my
   * reasoning that invite_campaigns has no owner column so nobody asked for
   * the conversation. Tornike overruled it the same hour and his argument is
   * the better one: in that thread the assistant suggests to its OWN user a
   * person worth inviting and explains how they grow that user's network. The
   * value is theirs, so the cost is theirs.
   */
  it('a campaign invite is paid by the user — Tornike, 16 September', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    expect(await runPayerFor('42', 9, 'campaign_invite')).toBe('42');
    // And it costs no query to say so.
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('a missing request row bills the user, never nobody', async () => {
    // The direction that matters: a lookup failure must not be able to make
    // runs free, which is the way this costs the company without anyone
    // noticing.
    mockQuery.mockResolvedValue(rows([]) as never);

    expect(await runPayerFor('42', 9, 'incoming_request')).toBe('42');
  });

  it('an ordinary thread is still the user, and asks the database nothing', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    expect(await runPayerFor('42', 9, 'regular')).toBe('42');
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

/**
 * One approval, two asks, forty-one seconds apart, the second marked
 * is_follow_up TRUE — read off task_asks by the seat, 18 September:
 *
 *   ask 2245  12:52:40  is_follow_up false
 *   ask 2246  12:53:21  is_follow_up true
 *
 * and the same shape the day before at three times the width: three people
 * each sent the same question twice, twenty seconds apart, off one approval.
 *
 * Nobody had read the first message. What each of them received, in their own
 * language, in their own chat window, was „X's assistant WROTE AGAIN" above the
 * identical question. The lookup accepted status 'sent' as readily as
 * 'answered', so an unanswered question counted as a conversation.
 */
describe('a second message to somebody who has not replied', () => {
  it('is NOT a new round, however live the thread is', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' }, liveThread: 9413, liveStatus: 'sent' });

    await createAsk('42', 3, '+995599111222', 'one more thing');

    const insert = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO task_asks'),
    ) as [string, unknown[]];
    expect(insert[1][7]).toBe(false); // is_follow_up
  });

  it('still lands in the same thread, which was always right', async () => {
    // Two threads for one exchange put the answer and the question that
    // followed it in different rooms (ticket 9 task 12). That stays fixed.
    routeAskQueries({ member: { userId: 7, name: 'გია' }, liveThread: 9413, liveStatus: 'sent' });

    await createAsk('42', 3, '+995599111222', 'one more thing');

    expect(mockCreateThread).not.toHaveBeenCalled();
    expect(mockSaveMessage.mock.calls[0][0]).toBe(9413);
  });

  it('does not tell them somebody wrote AGAIN, because nobody is ignoring anything', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' }, liveThread: 9413, liveStatus: 'sent' });

    await createAsk('42', 3, '+995599111222', 'one more thing');

    const opening = String(mockSaveMessage.mock.calls[0][3]);
    expect(opening).not.toContain('კიდევ დაწერა');
    expect(opening).toContain('დაამატა');
  });

  it('says „wrote again" only when they really did reply', async () => {
    routeAskQueries({
      member: { userId: 7, name: 'გია' },
      liveThread: 9413,
      liveStatus: 'answered',
    });

    await createAsk('42', 3, '+995599111222', '12:00');

    expect(String(mockSaveMessage.mock.calls[0][3])).toContain('კიდევ დაწერა');
  });

  it('spends their patience, not a fresh outreach slot', async () => {
    // The budget follows the THREAD, not the answer: a second message to
    // somebody who has not replied still spends their patience, and must not
    // spend a new outreach slot on a person already approached.
    routeAskQueries({ member: { userId: 7, name: 'გია' }, liveThread: 9413, liveStatus: 'sent' });

    await createAsk('42', 3, '+995599111222', 'one more thing');

    expect(mockFollowUpBudget).toHaveBeenCalled();
    expect(mockCheckBudget).not.toHaveBeenCalled();
  });
});

/**
 * Row 205 — one approval sending the same person the same question twice,
 * seconds apart.
 *
 *   goal 5580 -> 144942   12:52:40 · 12:53:21    41s
 *   goal 4627 -> 13927    14:23:29 · 14:23:50    21s
 *   goal 4627 -> 575      14:23:29 · 14:23:49    20s
 *   goal 4627 -> 118509   14:23:29 · 14:23:50    21s
 *
 * The two questions are never the same string — one is the other reworded —
 * so the discriminator is time and silence, not wording. That measurement is
 * why there is no text comparison anywhere in this guard.
 */
describe('the same question twice inside one run (row 205)', () => {
  it('refuses a second ask to somebody who has not answered the one sent seconds ago', async () => {
    routeAskQueries({
      member: { userId: 7, name: 'გია' },
      liveThread: 9413,
      liveStatus: 'sent',
      liveSecondsAgo: 41,
    });

    const out = await createAsk('42', 3, '+995599111222', 'იცნობ სანდო ბუღალტერს თბილისში?');

    expect(out.sent).toBe(false);
    expect((out as { reason?: string }).reason).toBe('duplicate_ask_in_flight');
    // Nothing reaches the person: no row, no message on their phone.
    expect(
      mockQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO task_asks')),
    ).toBe(false);
    expect(mockSaveMessage).not.toHaveBeenCalled();
  });

  it('names the wait in seconds and forbids the reworded retry by name', async () => {
    routeAskQueries({
      member: { userId: 7, name: 'გია' },
      liveThread: 9413,
      liveStatus: 'sent',
      liveSecondsAgo: 21,
    });

    const out = await createAsk('42', 3, '+995599111222', 'იგივე კითხვა სხვა სიტყვებით');

    const error = (out as { error: string }).error;
    expect(error).toContain('21 წამის წინ');
    expect(error).toContain('სხვა სიტყვებით');
    // And it says what to do instead, in this same run — the standing rule
    // that one block never stops the list.
    expect(error).toContain('მეორე წრით');
  });

  it('lets a LATER message through — a nudge is not a duplicate', async () => {
    // Deliberate: the four-a-day per-person cap is what governs a second
    // message to somebody who has not replied. This guard only covers the
    // window inside one run.
    routeAskQueries({
      member: { userId: 7, name: 'გია' },
      liveThread: 9413,
      liveStatus: 'sent',
      liveSecondsAgo: 3600,
    });

    const out = await createAsk('42', 3, '+995599111222', 'one more thing');

    expect(out.sent).toBe(true);
  });

  it('lets a second question through once they have ANSWERED, however fast', async () => {
    routeAskQueries({
      member: { userId: 7, name: 'გია' },
      liveThread: 9413,
      liveStatus: 'answered',
      liveSecondsAgo: 5,
    });

    const out = await createAsk('42', 3, '+995599111222', '12:00');

    expect(out.sent).toBe(true);
  });

  it('does not block a DIFFERENT sender reaching the same person on the same goal', async () => {
    // A relay arriving from somebody else is a different person asking, not
    // the same question twice; the receiving cap governs that one.
    routeAskQueries({
      member: { userId: 7, name: 'გია' },
      liveThread: 9413,
      liveStatus: 'sent',
      liveSecondsAgo: 30,
      liveFromUserId: '99',
    });

    const out = await createAsk('42', 3, '+995599111222', 'იცნობ ბუღალტერს?');

    expect(out.sent).toBe(true);
  });
});

/**
 * Row 148 — one note per PERSON, not one per ask.
 *
 * The seat filed it on 17 September: somebody got the same „no longer needed"
 * note TWICE, in the same second. It sat as „could not check" on the plate,
 * and it had happened twice more by the time anybody looked:
 *
 *   thread 14885   16 Sep 16:38:53.415 / .743   task 2971, asks 1519 + 1585
 *   thread 15512   17 Sep 18:37:17.575 / .892   task 3433, asks 1816 + 2080
 *   thread 20098   21 Sep 13:19:23.834 / :24.274  task 6667, asks 3136 + 3369
 *
 * A relayed conversation CONTINUES IN ONE THREAD — that is ask_contact's own
 * promise, „later messages land in the same thread on their phone" — so a goal
 * with two sent asks to one person has two rows pointing at one thread.
 *
 * Two of the three were an ask plus its follow-up and the third was two
 * ordinary asks, which is why „skip follow-ups" is the wrong fix: it would
 * have closed two of three and looked correct.
 */
describe('cancelAsksForTask tells each person once', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes ONE note when two asks share a thread', async () => {
    mockQuery.mockResolvedValue(
      rows([
        { ask_thread_id: 20098, to_user_id: 7 },
        { ask_thread_id: 20098, to_user_id: 7 },
      ]) as never,
    );

    const n = await cancelAsksForTask(6667);

    expect(mockSaveMessage).toHaveBeenCalledTimes(1);
    expect(mockSaveMessage.mock.calls[0][0]).toBe(20098);
    // The owner still hears the truth: two questions were cancelled.
    expect(n).toBe(2);
  });

  it('still writes to each DIFFERENT person', async () => {
    mockQuery.mockResolvedValue(
      rows([
        { ask_thread_id: 61, to_user_id: 7 },
        { ask_thread_id: 62, to_user_id: 8 },
        { ask_thread_id: 61, to_user_id: 7 },
      ]) as never,
    );

    await cancelAsksForTask(3);

    expect(mockSaveMessage).toHaveBeenCalledTimes(2);
    expect(mockSaveMessage.mock.calls.map((c) => c[0])).toEqual([61, 62]);
  });

  /** And the header is cleared once too, not twice (row 233). */
  it('clears the thread header once per thread', async () => {
    mockQuery.mockResolvedValue(
      rows([
        { ask_thread_id: 20098, to_user_id: 7 },
        { ask_thread_id: 20098, to_user_id: 7 },
      ]) as never,
    );

    await cancelAsksForTask(6667);

    const forThread = (setThreadStatus as jest.Mock).mock.calls.filter((c) => c[1] === 20098);
    expect(forThread).toHaveLength(1);
  });
});

/**
 * THE PHONE-LEVEL HALF, WHICH NOTHING HELD.
 *
 * Found by sabotage on 22 September. Disabling each guard in turn and running
 * the whole suite:
 *
 *   user-level stop   createAsk               2 tests fail      HELD
 *   phone-level stop  createAsk               3,697 pass        NOT HELD
 *
 * The two lists are two different people. `ask_optouts` is a Netai user who
 * pressed stop. `phone_optouts` outlives a DELETED ACCOUNT (migration 056) —
 * the comment above the guard says why: „an erased number must not be
 * reachable again just because someone still has it in a contact list." The
 * single live row in that table today is exactly that: reason
 * `account_deleted`, 2 September.
 *
 * So the untested half is the one protecting the person who is no longer here
 * to complain about it.
 */
describe('the phone-level stop is enforced too, and it is a different list', () => {
  it('refuses when the PHONE is on the stop list, though the account is not', async () => {
    mockOptedOut.mockResolvedValue(false);
    mockPhoneStop.mockResolvedValue(true);

    const out = await createAsk('42', 3, '+995599111222', 'კითხვა');

    expect(out.sent).toBe(false);
    expect(out.reason).toBe('recipient_opted_out');
    expect(mockPhoneStop).toHaveBeenCalledWith('+995599111222');
  });

  /** Nothing is written and nobody is told — the refusal is the whole act. */
  it('creates no thread and writes no message for an erased number', async () => {
    mockPhoneStop.mockResolvedValue(true);

    await createAsk('42', 3, '+995599111222', 'კითხვა');

    expect(mockCreateThread).not.toHaveBeenCalled();
    expect(mockSaveMessage).not.toHaveBeenCalled();
  });

  /**
   * The owner hears the truth, not „a technical delay" — the wording contract
   * written above the guard, and the reason a refusal must not read as a
   * failure the owner should retry.
   */
  it('tells the owner it was the person’s decision', async () => {
    mockPhoneStop.mockResolvedValue(true);

    const said = String((await createAsk('42', 3, '+995599111222', 'კითხვა')).error);

    expect(said).toContain('მისი გადაწყვეტილებაა');
    expect(said).toContain('ტექნიკური შეფერხება');
  });
});

/**
 * THE THREE CONDITIONS IN ONE LINE, AND ONLY THE PERMISSION BESIDE THEM WAS HELD.
 *
 * Sabotage, 22 September:
 *
 *   `!task.permission_granted`                              1 test fails   HELD
 *   `!task || user_id !== fromUserId || status !== 'open'`  3,728 pass     NOT HELD
 *
 * The second line carries three separate refusals and the middle one is an
 * AUTHORISATION check: without it, one account can create asks against another
 * account's goal — writing to real people in somebody else's name, from their
 * goal, with their permission flag standing in for consent that was never
 * given about this.
 *
 * The comment above the gate explains the permission half at length and says
 * nothing about ownership, which is probably why only the permission half ever
 * got a test. All three are refusals of the same weight at the same choke
 * point, so all three are held here.
 */
describe('the gate refuses on all three counts, not only the permission', () => {
  it('refuses when the goal does not exist', async () => {
    mockGetTask.mockResolvedValue(null as never);

    const out = await createAsk('42', 3, '+995599111222', 'კითხვა');

    expect(out.sent).toBe(false);
    expect(out.reason).toBe('task_not_open');
  });

  /**
   * THE AUTHORISATION ONE. Account 99 asking on account 42's goal is not a
   * mistake to report politely — it is somebody writing to real people out of
   * a goal that is not theirs.
   */
  it('refuses when the caller does not own the goal', async () => {
    mockGetTask.mockResolvedValue({
      id: 3,
      user_id: 42,
      status: 'open',
      permission_granted: true,
    } as never);

    const out = await createAsk('99', 3, '+995599111222', 'კითხვა');

    expect(out.sent).toBe(false);
    expect(out.reason).toBe('task_not_open');
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it('refuses when the goal is closed', async () => {
    mockGetTask.mockResolvedValue({
      id: 3,
      user_id: 42,
      status: 'done',
      permission_granted: true,
    } as never);

    const out = await createAsk('42', 3, '+995599111222', 'კითხვა');

    expect(out.sent).toBe(false);
    expect(out.reason).toBe('task_not_open');
  });

  /**
   * The control: the same call with all three satisfied must still go out, or
   * the three above would pass against a gate that refuses everything.
   */
  it('and still sends when the goal exists, is owned, and is open', async () => {
    // The recipient and the budget queries, same as every sending test here.
    // Without them the three refusals above would pass against a gate that
    // refuses everything, which proves nothing about any of them.
    routeAskQueries({ member: { userId: 7, name: 'გია' } });

    const out = await createAsk('42', 3, '+995599111222', 'კითხვა');

    expect(out.sent).toBe(true);
  });
});
