jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../threads.service', () => ({
  __esModule: true,
  saveThreadMessage: jest.fn().mockResolvedValue(undefined),
  createThread: jest.fn().mockResolvedValue({ id: 1 }),
  userLanguage: jest.fn().mockResolvedValue('ka'),
  threadLanguage: jest.fn().mockResolvedValue('ka'),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { saveThreadMessage, userLanguage } from '../threads.service';
import { answerAskTapAtOnce, setLaterDays } from '../taskAsks.service';
import { buildIncomingAskSection } from '../chat.service';
import {
  allLaterChoices,
  allYesChoices,
  askChoices,
  AskTap,
  askTapLineForAsker,
  askTapOf,
  declineChoice,
  isDeclineChoice,
} from '../askOpening';
import { RunLanguage } from '../runLanguage';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSave = saveThreadMessage as jest.MockedFunction<typeof saveThreadMessage>;
const mockLanguage = userLanguage as jest.MockedFunction<typeof userLanguage>;

const LANGUAGES: readonly RunLanguage[] = ['en', 'ru', 'es', 'ka'];
const ASK_THREAD = 27001;
const GOAL_THREAD = 21504;
const ASKER = 171937;

const claims = (rows: unknown[]): void => {
  mockQuery.mockResolvedValue({ rows, rowCount: rows.length } as never);
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLanguage.mockResolvedValue('ka');
});

/**
 * ROW 300 — THREE BUTTONS UNDER AN INCOMING ASK: YES / NO / LATER.
 *
 * The tester's case: a reader who could help but needed a day left the asker
 * looking at silence that meant yes. Each tap is an exact string, like the
 * decline, so the server acts on what the person pressed and never on a guess.
 */
describe('the three buttons', () => {
  it('draws yes, decline, later — in that order, in every language', () => {
    for (const language of LANGUAGES) {
      const [yes, no, later] = askChoices(language);
      expect(askTapOf(yes)).toBe(AskTap.Yes);
      expect(no).toBe(declineChoice(language));
      expect(askTapOf(later)).toBe(AskTap.Later);
    }
  });

  it('keeps each label distinct, so no tap can be read as another', () => {
    for (const choice of [...allYesChoices(), ...allLaterChoices()]) {
      expect(isDeclineChoice(choice)).toBe(false);
    }
    // #1948: two yes buttons per language (help, know someone) and one later.
    expect(new Set([...allYesChoices(), ...allLaterChoices()]).size).toBe(LANGUAGES.length * 4);
  });

  it('reads nothing into words the person typed', () => {
    for (const said of ['კი', 'yes', 'later', 'მოგვიანებით', '', '   ']) {
      expect(askTapOf(said)).toBeNull();
    }
  });

  it('matches a tap with stray spaces around it', () => {
    expect(askTapOf(`  ${askChoices('ka')[2]} `)).toBe(AskTap.Later);
  });
});

describe('the asker is told at once, once', () => {
  it('writes „can help" into the goal thread, in the asker’s language', async () => {
    claims([{ from_user_id: ASKER, task_thread_id: GOAL_THREAD, reader_name: 'Nino' }]);
    mockLanguage.mockResolvedValue('en');

    await answerAskTapAtOnce(ASK_THREAD, askChoices('ka')[0]);

    expect(mockQuery.mock.calls[0][1]).toEqual([ASK_THREAD]);
    expect(String(mockQuery.mock.calls[0][0])).toContain('offered_help_at IS NULL');
    expect(mockSave).toHaveBeenCalledWith(
      GOAL_THREAD,
      ASKER,
      'assistant',
      askTapLineForAsker(AskTap.Yes, 'en', 'Nino'),
    );
  });

  it('re-times the one reminder on „later"', async () => {
    claims([{ from_user_id: ASKER, task_thread_id: GOAL_THREAD, reader_name: 'Nino' }]);

    await answerAskTapAtOnce(ASK_THREAD, askChoices('en')[2]);

    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain('later_at = NOW(), reminded_at = NULL');
    expect(sql).toContain('later_at IS NULL');
    expect(mockSave).toHaveBeenCalledWith(
      GOAL_THREAD,
      ASKER,
      'assistant',
      askTapLineForAsker(AskTap.Later, 'ka', 'Nino'),
    );
  });

  it('names the day the ask comes back, at the tap (tester 42114)', async () => {
    claims([
      {
        from_user_id: ASKER,
        task_thread_id: GOAL_THREAD,
        reader_name: 'Nino',
        later_until: new Date('2026-10-09T05:30:00Z'),
      },
    ]);

    await answerAskTapAtOnce(ASK_THREAD, askChoices('en')[2]);

    expect(mockSave).toHaveBeenCalledWith(
      GOAL_THREAD,
      ASKER,
      'assistant',
      // The tester's 44584 (D722): one sentence with the day, no status line under it.
      'Nino მოგვიანებით გიპასუხებს, 9 ოქტომბრამდე (პარასკევი).',
    );
  });

  it('writes nothing when the tap was already recorded', async () => {
    claims([]);

    await answerAskTapAtOnce(ASK_THREAD, askChoices('ka')[0]);

    expect(mockSave).not.toHaveBeenCalled();
  });

  it('names an unnamed reader the way the opening does', async () => {
    claims([{ from_user_id: ASKER, task_thread_id: GOAL_THREAD, reader_name: null }]);
    mockLanguage.mockResolvedValue('en');

    await answerAskTapAtOnce(ASK_THREAD, askChoices('en')[0]);

    expect(String(mockSave.mock.calls[0][3])).toContain('A Netai member');
  });

  // D712: a short line may be one of the ask's own written buttons, so only a
  // line longer than any button skips the database.
  it('never touches the database for a typed answer or a decline', async () => {
    await answerAskTapAtOnce(
      ASK_THREAD,
      'ვიცნობ ერთ კარგ ადვოკატს, ხვალ მოგწერ მის ნომერს და დეტალებს',
    );
    await answerAskTapAtOnce(ASK_THREAD, declineChoice('ka'));

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('cannot fail the person’s message, and says so when it fails', async () => {
    mockQuery.mockRejectedValue(new Error('timeout'));
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(answerAskTapAtOnce(ASK_THREAD, askChoices('ka')[2])).resolves.toBeUndefined();

    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

/** #1981 (tester 42210): the reader's own pick corrects the day the asker reads. */
describe('the day the reader picks reaches the asker', () => {
  const row = (before: string | null, until: string): unknown => ({
    from_user_id: ASKER,
    task_thread_id: GOAL_THREAD,
    reader_name: 'Nino',
    before: before === null ? null : new Date(before),
    later_until: new Date(until),
  });

  it('writes the new day when it differs from the one she was told', async () => {
    claims([row('2026-10-09T05:30:00Z', '2026-10-07T05:30:00Z')]);

    await setLaterDays(ASK_THREAD, 1);

    expect(mockSave).toHaveBeenCalledWith(
      GOAL_THREAD,
      ASKER,
      'assistant',
      'Nino მოგვიანებით გიპასუხებს, 7 ოქტომბრამდე (ოთხშაბათი).',
    );
  });

  it('writes nothing when the day did not change', async () => {
    claims([row('2026-10-09T05:30:00Z', '2026-10-09T05:30:00Z')]);

    await setLaterDays(ASK_THREAD, 3);

    expect(mockSave).not.toHaveBeenCalled();
  });

  it('writes nothing when no open ask is on the thread', async () => {
    claims([]);

    expect(await setLaterDays(ASK_THREAD, 1)).toBeNull();
    expect(mockSave).not.toHaveBeenCalled();
  });
});

describe('the reminder and the reader’s own run', () => {
  const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('sends the one reminder when a „later" runs out, 48 hours after an untapped ask', () => {
    const sweep = asks.slice(asks.indexOf('export async function sendDueAskReminders'));
    expect(sweep.slice(0, 1800)).toContain('later_at IS NULL');
    expect(sweep.slice(0, 1800)).toContain(
      "COALESCE(later_until, later_at + INTERVAL '1 day') <= NOW()",
    );
    // #1684: a „later" tap with no date holds for three days.
    expect(asks).toContain('later_until = ${LATER_UNTIL_SQL(String(LATER_DEFAULT_DAYS))}');
  });

  it('is hooked where the person’s own message is stored', () => {
    const keep = chat.slice(chat.indexOf('export async function keepUserMessage'));
    expect(keep.slice(0, 1100)).toContain('void answerAskTapAtOnce(threadId, message)');
  });

  it('tells the reader’s run what each tap already did', () => {
    const section = buildIncomingAskSection({
      id: 1,
      question: 'ადვოკატს ხომ არ იცნობ?',
      from_name: 'Giorgi',
    } as Parameters<typeof buildIncomingAskSection>[0]);
    for (const choice of [...allYesChoices(), ...allLaterChoices()]) {
      expect(section).toContain(`„${choice}"`);
    }
  });

  /** 903: Test 65's „my cousin is an accountant, but busy" was held and framed as a decline. */
  it('tells the reader’s run that a lead with a caveat is an answer, sent as typed', () => {
    const section = buildIncomingAskSection({
      id: 1,
      question: 'ბუღალტერს იცნობ?',
      from_name: 'Netai Test 68',
    } as Parameters<typeof buildIncomingAskSection>[0]);
    expect(section).toContain('პასუხია, არა უარი');
    expect(section).toContain('არასდროს შესთავაზო „სხვა მოვძებნო შენს კონტაქტებში"');
  });

  /** 903: Test 62's assistant called its owner „დათო", a name found nowhere. */
  it('never lets the reader’s run invent the reader’s name', () => {
    const section = buildIncomingAskSection({
      id: 1,
      question: 'ბუღალტერს იცნობ?',
      from_name: 'Netai Test 68',
    } as Parameters<typeof buildIncomingAskSection>[0]);
    expect(section).toContain('სახელს არასდროს მოიგონებ');
  });
});
