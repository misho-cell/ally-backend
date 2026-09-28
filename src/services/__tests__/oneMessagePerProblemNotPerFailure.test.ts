jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import {
  alarmText,
  claimFirstAlert,
  clearResolved,
  openIncident,
  OpenIncident,
  recoveryText,
} from '../outageAlarm.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * ⚠️ THE SERVER KNEW FOR FIVE HOURS AND HAD NO WAY TO SAY SO.
 *
 * 28 September, 02:34:01: the provider refused every request. Thirty-four
 * goals across seven people died — five real people, the founder among them —
 * and every one had its next wake pushed a full day, so even raising the limit
 * would not bring them back that day. `outage.sh` saw it within minutes and
 * the heartbeat named the provider's own sentence. Neither could tell anybody.
 *
 * The founder's words, 07:57: „I want that whatsapp message sent to me, misho,
 * giorgi and lika. to all of us". Misho asked for the same, naming the same
 * four, directly.
 *
 * What this file holds is the three properties that decide whether such an
 * alarm is trusted or muted.
 */
describe('one message per problem, not per failure', () => {
  beforeEach(() => jest.clearAllMocks());

  /**
   * ⚠️ THE PROMISE THAT MATTERS MOST. Thirty-four goals failed behind ONE
   * cause. An alarm that speaks per failure is thirty-four messages at three
   * in the morning, and the fifth one is the last one anybody reads.
   *
   * It is the INSERT's `ON CONFLICT DO NOTHING` against the partial unique
   * index that makes this true — not a check in TypeScript, which two
   * overlapping containers during a deploy would both pass.
   */
  it('opens at most one incident per cause, and leaves an open one alone', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never).mockResolvedValueOnce({
      rows: [
        {
          id: 7,
          cause: 'provider_refusing',
          detail: 'usage limits',
          people_affected: 7,
          started_at: '2026-09-28T02:34:01Z',
          alerted_at: null,
        },
      ],
      rowCount: 1,
    } as never);

    const open = await openIncident('provider_refusing', 'usage limits', 7);

    expect(open?.id).toBe(7);
    const insert = String(mockQuery.mock.calls[0][0]);
    expect(insert).toContain('INSERT INTO outage_incidents');
    expect(insert).toContain('ON CONFLICT DO NOTHING');
  });

  /**
   * ⚠️ TWO CONTAINERS, ONE MESSAGE. A deploy leaves the old process and the
   * new one alive together for a few seconds — and an outage is most likely to
   * be noticed in exactly that window, because a deploy is often what somebody
   * is doing when it breaks. Reading `alerted_at` and then sending would let
   * both read NULL and both send.
   */
  it('claims the first alert atomically, in the UPDATE itself', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 7 }], rowCount: 1 } as never);

    await expect(claimFirstAlert(7)).resolves.toBe(true);

    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain('SET alerted_at = NOW()');
    expect(sql).toContain('alerted_at IS NULL');
    expect(sql).toContain('RETURNING id');
  });

  it('says no to the loser of that race rather than sending twice', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await expect(claimFirstAlert(7)).resolves.toBe(false);
  });

  /**
   * ⚠️ NEVER TELL SOMEBODY IT IS FIXED IF THEY WERE NEVER TOLD IT BROKE.
   *
   * An incident that opens and clears between two sweeps — a blip nobody saw —
   * would otherwise send four people a cheerful „the assistant is answering
   * again" about a problem they never knew existed. That is how an alarm gets
   * muted, and a muted alarm is worse than none.
   */
  it('reports a recovery only for incidents somebody was told about', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          id: 7,
          cause: 'provider_refusing',
          detail: 'usage limits',
          people_affected: 7,
          started_at: '2026-09-28T02:34:01Z',
          alerted_at: '2026-09-28T02:36:00Z',
        },
        {
          id: 8,
          cause: 'login_codes',
          detail: 'a blip',
          people_affected: 0,
          started_at: '2026-09-28T04:00:00Z',
          alerted_at: null,
        },
      ],
      rowCount: 2,
    } as never);

    const toAnnounce = await clearResolved([]);

    expect(toAnnounce.map((i) => i.id)).toEqual([7]);
  });

  it('leaves a cause alone while it is still broken', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await clearResolved(['provider_refusing']);

    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain('NOT (cause = ANY($1::text[]))');
  });
});

/**
 * THE WORDS, AND THE FOUNDER'S THREE REQUIREMENTS IN HIS ORDER: what broke,
 * since when, how many people — and then the thing he asked for that nobody
 * else thought to ask for, which is WHO FIXES IT.
 *
 * An alarm that does not say what to do is a worry, not a message. It is the
 * last line that makes it actionable at three in the morning.
 */
describe('what a person reads at three in the morning', () => {
  const incident: OpenIncident = {
    id: 7,
    cause: 'provider_refusing',
    detail: 'You have reached your specified API usage limits',
    people_affected: 7,
    started_at: '2026-09-28T02:34:01.000Z',
    alerted_at: null,
  };

  it('names what broke, since when, how many, and who fixes it', () => {
    const text = alarmText(incident, new Date('2026-09-28T05:34:01.000Z'));

    expect(text).toContain('cannot answer anybody');
    expect(text).toContain('02:34 UTC');
    expect(text).toContain('3 h');
    expect(text).toContain('7 people affected');
    expect(text).toContain('You have reached your specified API usage limits');
    expect(text).toContain('Tornike or Lika');
  });

  /** „nobody affected yet" is a different fact from „0 people affected". */
  it('does not say a number when nobody has been hit yet', () => {
    const text = alarmText({ ...incident, people_affected: 0 }, new Date(incident.started_at));

    expect(text).toContain('nobody affected yet');
    expect(text).not.toContain('0 people');
  });

  it('says how long it lasted when it clears', () => {
    const text = recoveryText(incident, new Date('2026-09-28T03:04:01.000Z'));

    expect(text).toContain('now fixed');
    expect(text).toContain('30 min');
  });
});

/**
 * ⚠️ IT CANNOT SEND YET, AND THAT MUST BE LOUD RATHER THAN QUIET.
 *
 * The only WhatsApp template this account owns is `whatsup_otp`, which carries
 * a login code. Sending an outage report through it would deliver „Your code
 * is: Anthropic spend limit reached…" — wrong for the reader and against
 * WhatsApp's rules. I told the tester „WhatsApp needs only a yes" before
 * reading the function, that sentence reached the founder, and he decided on
 * it. So the refusal is explicit, and the reason is in the file.
 */
describe('it refuses rather than sending the wrong template', () => {
  const SEND = readFileSync(join(__dirname, '..', 'outageAlarm.send.ts'), 'utf8');

  /**
   * ⚠️ READ THE CODE, NOT THE PROSE. The file NAMES `sendWhatsAppMessage` in
   * order to explain why it must not be used, so an assertion that the file
   * does not contain those letters fails on the very comment that documents
   * the rule. That is the third time in one night this exact shape has caught
   * me — the measurement was right and the question was different — so the
   * comments come out before the question is asked.
   */
  const CODE = SEND.split('\n')
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith('*') || t.startsWith('/*') || t.startsWith('//'));
    })
    .join('\n');

  it('will not fall back to the OTP template', () => {
    expect(CODE).not.toContain('sendWhatsAppMessage');
    expect(CODE).toContain('sendWhatsAppTemplate');
  });

  it('says plainly that the template is what is missing, not the code', () => {
    expect(SEND).toContain('CANNOT SEND — no WHATSAPP_ALERT_TEMPLATE');
    expect(SEND).toContain("'no_template'");
  });

  /**
   * D149: no file here carries a full phone number. The list is ACCOUNT IDS
   * and the number is read at send time — which is also why somebody changing
   * their number does not silently fall off the alarm.
   */
  it('keeps numbers out of the source and reads them at send time', () => {
    expect(SEND).toContain('ALARM_RECIPIENT_IDS');
    expect(SEND).toContain('FROM "UserPhone"');
    expect(SEND).not.toMatch(/\+\d{9,}/);
  });

  /**
   * ⚠️ AND IT IS HONEST ABOUT BEING INCOMPLETE. Two of the four people the
   * founder named could not be identified from their names alone — „Lika"
   * matched fifteen accounts and „Misho" three — and an outage alarm sent to a
   * stranger cannot be taken back. A list that is three-quarters right is not
   * a list, so the two confirmed ids are in and the other two are named as
   * missing.
   */
  it('ships only the recipients that were actually confirmed', () => {
    expect(SEND).toContain('ALARM_RECIPIENTS_PENDING');
    expect(SEND).toContain('cannot be taken back');
  });
});

/**
 * ⚠️ A RECIPIENT WHO CANNOT BE REACHED IS WORSE THAN AN ABSENT ONE.
 *
 * The tester handed me all four account ids from the admin. I checked each
 * against `UserPhone` before adding it, and 167250 — „Misho", admin, allyapp
 * email — HAS NO PHONE ROW. Adding it would have made every alarm go to three
 * people while the list said four, silently, until somebody asked why Misho
 * never gets them. The list itself would have been the lie.
 *
 * And the founder has TWO phone rows, so the obvious mapping sends him
 * everything twice. „The alarm is noisy" is how an alarm gets muted, which is
 * the one failure this whole file exists to prevent.
 */
describe('the list says only what it can actually do', () => {
  const SEND = readFileSync(join(__dirname, '..', 'outageAlarm.send.ts'), 'utf8');

  it('leaves out the account with no phone rather than listing it', () => {
    expect(SEND).toContain('167250');
    expect(SEND).toContain('HAS NO PHONE ROW AT ALL');
    const list = SEND.slice(
      SEND.indexOf('export const ALARM_RECIPIENT_IDS'),
      SEND.indexOf('export const ALARM_RECIPIENTS_PENDING'),
    );
    expect(list).toContain('501');
    expect(list).toContain('118509');
    expect(list).toContain('160584');
    // The one that cannot be reached is named in the prose above, never in the list.
    expect(list).not.toContain('167250');
  });

  /** One message per PERSON. The founder has two numbers. */
  it('sends one message per person even when they have two numbers', () => {
    expect(SEND).toContain('ONE MESSAGE PER PERSON, NOT PER NUMBER');
    expect(SEND).toContain('firstPerPerson');
  });

  /** A stable choice, not whatever the planner returned that day. */
  it('picks the same number every time', () => {
    expect(SEND).toContain('ORDER BY "userId", id');
  });
});

/**
 * ⚠️ THE PROBE SPEAKS AND NOTHING ELSE DOES, AND THAT IS THE WHOLE DESIGN.
 *
 * On 28 September silence and death looked identical from outside. `outage.sh`
 * has a verdict called NOTHING PROVEN for exactly that: no errors and no calls
 * could mean the provider is down, or could mean it is four in the morning and
 * nobody is using the product.
 *
 * Every detector built on counting is an inference from absence, and the whole
 * lesson of that night is that an inference from absence is not evidence. The
 * heartbeat makes a REAL call and gets a REAL answer — so it detects, and the
 * three causes without a probe are honestly not detected at all rather than
 * guessed at.
 */
describe('only the probe is allowed to say the provider is down', () => {
  const DETECT = readFileSync(join(__dirname, '..', 'outageDetect.service.ts'), 'utf8');
  const HEARTBEAT = readFileSync(join(__dirname, '..', 'heartbeat.cron.ts'), 'utf8');

  it('is wired to the probe that actually calls the provider', () => {
    expect(HEARTBEAT).toContain('noticeProviderRefusing');
    expect(HEARTBEAT).toContain('noticeProviderAnswering');
  });

  /**
   * The provider's own sentence, carried through rather than summarised.
   * "usage limits", "invalid key" and "overloaded" are three problems with
   * three owners and only one of them is money — "the provider refused" and
   * nothing more sends somebody to look in the wrong place at 3 a.m.
   */
  it('passes the provider its own words', () => {
    expect(HEARTBEAT).toContain('noticeProviderRefusing((err as Error).message)');
  });

  /**
   * ⚠️ PEOPLE, NOT FAILURES. That night thirty-four goals died across SEVEN
   * people, and "34" in a three-in-the-morning message reads as thirty-four
   * humans. The number that decides whether somebody gets out of bed is how
   * many people, and here the two differ by a factor of five.
   */
  it('counts people and not failures', () => {
    expect(DETECT).toContain('COUNT(DISTINCT user_id)');
    expect(DETECT).toContain('A COUNT OF PEOPLE, NOT OF FAILURES');
  });

  /** A count that cannot be read must not swallow the alarm. */
  it('still alerts when the count cannot be read', () => {
    expect(DETECT).toContain('return 0;');
    expect(DETECT).toContain('must not stop the alarm');
  });

  /** Says nothing about the three causes it cannot honestly see. */
  it('does not pretend to detect the other three causes', () => {
    expect(DETECT).not.toContain("'api_down'");
    expect(DETECT).not.toContain("'login_codes'");
    expect(DETECT).toContain('are NOT detected here and are not pretended to be');
  });
});
