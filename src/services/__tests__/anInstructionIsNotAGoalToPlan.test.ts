jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../chat.service', () => ({ __esModule: true, processChat: jest.fn() }));
jest.mock('../taskStore.service', () => ({
  __esModule: true,
  getTaskById: jest.fn(),
  ensureNextWake: jest.fn().mockResolvedValue(true),
  // The control path's own question: has this goal already written to anybody?
  // False, so the control reaches the real verdict rather than short-circuiting.
  goalHasActedOutward: jest.fn().mockResolvedValue(false),
}));
jest.mock('../tools/nameMatch', () => ({
  __esModule: true,
  messageNamesOwnContact: jest.fn(),
}));
jest.mock('../threads.service', () => ({
  __esModule: true,
  getThread: jest.fn(),
  saveThreadMessage: jest.fn().mockResolvedValue(undefined),
  threadLanguage: jest.fn().mockResolvedValue('ka'),
  lastAssistantMessageIs: jest.fn().mockResolvedValue(false),
}));
jest.mock('../askBudget.service', () => ({
  __esModule: true,
  describeAskBudget: jest.fn().mockResolvedValue(null),
}));
jest.mock('../runFailure.service', () => ({ __esModule: true, markRunFailed: jest.fn() }));
jest.mock('../sse.service', () => ({
  __esModule: true,
  emitRunComplete: jest.fn(),
  emitRunError: jest.fn(),
}));
jest.mock('../threadStatus.service', () => ({ __esModule: true, setThreadStatus: jest.fn() }));
jest.mock('../tokenWallet.service', () => ({
  __esModule: true,
  checkRunAllowance: jest.fn().mockResolvedValue({ allowed: true }),
}));
jest.mock('../inFlightRuns', () => ({
  __esModule: true,
  isDraining: jest.fn().mockReturnValue(false),
  beginRun: jest.fn(),
  endRun: jest.fn(),
}));

import { getTaskById } from '../taskStore.service';
import { messageNamesOwnContact } from '../tools/nameMatch';
import { query } from '../../db/postgres/client';
import { nothingToPlanYet } from '../taskEngine.service';

const mockTask = getTaskById as jest.MockedFunction<typeof getTaskById>;
const mockNames = messageNamesOwnContact as jest.MockedFunction<typeof messageNamesOwnContact>;
const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * ROW 104's SECOND CAUSE — THE ONE MY OWN FIX DID NOT TOUCH.
 *
 * The consent wall was the first cause and closing it was right. The tester
 * then ran the same instruction on a seat with NO open goal and it failed
 * anyway (their 476, case a): the MODEL opened a goal with `create_task`, a new
 * goal has no plan, and the plan-proposal wake told it to draw one and ask
 * „Want me to go ahead?" with two buttons.
 *
 * So the owner typed one clear instruction and was asked a second time — row
 * 104's own words — through a door I had not shut. The wall never saw it: no
 * grant was attempted and no ask was made.
 *
 * D316 says such a goal does not need a plan. It needs one ask and one line
 * afterwards saying who it went to. Demanding a plan for it IS the second yes
 * the ruling exists to abolish.
 *
 * THE SHAPE, AGAIN: the server's own goal path (`ensureGoalForRequest`) has
 * refused to open a goal from such a sentence since row 103. `create_task` —
 * the door the model actually used — never had the rule. One wire guarded, the
 * other not.
 */
beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [{ acted: false }], rowCount: 1 } as never);
  mockNames.mockResolvedValue(false);
});

const openGoal = (title: string, brief = ''): void => {
  mockTask.mockResolvedValue({
    id: 9109,
    user_id: 171938,
    status: 'open',
    plan: null,
    plan_proposed: null,
    title,
    brief,
  } as never);
};

describe('a goal that IS an instruction is not sent back for a plan', () => {
  it('asks for no plan when the goal names one contact and one action', async () => {
    openGoal('Tell Netai Test 9 I can do Thursday');
    mockNames.mockResolvedValue(true);

    expect(await nothingToPlanYet(9109)).toBe(false);
  });

  /** The Georgian half, which is the common case and the easiest to leave out. */
  it('does the same in Georgian', async () => {
    openGoal('თორნიკე აბულაძეს ჰკითხე თუ იცნობს კარგ ფილოსოფოსს');
    mockNames.mockResolvedValue(true);

    expect(await nothingToPlanYet(9109)).toBe(false);
  });

  /** The brief counts too — `create_task` puts the sentence in either field. */
  it('reads the brief as well as the title', async () => {
    openGoal('Thursday', 'Tell Netai Test 9 I can do Thursday');
    mockNames.mockResolvedValue(true);

    expect(await nothingToPlanYet(9109)).toBe(false);
  });
});

describe('and an ordinary goal still gets its plan, which is the control', () => {
  /**
   * THE HALF THAT COULD GO WRONG QUIETLY. A rule that suppresses the plan too
   * often produces „no second yes" by producing no plan at all — and a goal
   * with no plan writes to nobody. That is a silence bug traded for a
   * politeness one, and it would look like a fix on the board.
   */
  it('still asks for a plan on a stated need', async () => {
    openGoal('I need a good photographer in Tbilisi for a wedding');

    expect(await nothingToPlanYet(9109)).toBe(true);
    // Not even asked — the cheap half refuses first and saves the query.
    expect(mockNames).not.toHaveBeenCalled();
  });

  /**
   * AND THE PHONEBOOK HALF IS WHAT KEEPS „ask" IN AN ORDINARY SENTENCE FROM
   * COUNTING. „Ask around about a dentist" carries the verb and names nobody
   * the owner knows; it is a goal and must get a plan.
   */
  it('still asks for a plan when the verb is there but nobody named is a contact', async () => {
    openGoal('ask around about a good dentist');
    mockNames.mockResolvedValue(false);

    expect(await nothingToPlanYet(9109)).toBe(true);
    expect(mockNames).toHaveBeenCalled();
  });

  it('leaves a goal that already has a plan alone', async () => {
    mockTask.mockResolvedValue({
      id: 9109,
      user_id: 171938,
      status: 'open',
      plan: { version: 1 },
      plan_proposed: null,
      title: 'Tell Netai Test 9 I can do Thursday',
    } as never);

    expect(await nothingToPlanYet(9109)).toBe(false);
    expect(mockNames).not.toHaveBeenCalled();
  });
});
