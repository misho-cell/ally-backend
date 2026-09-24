import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ROW 101'S TOOL WAS UNDER-COUNTING THE THING IT EXISTS TO COUNT.
 *
 * `push.sh <user_id>` prints one line per endpoint per day, and the question it
 * answers is "how many copies of one notification does this person get". It
 * labelled each endpoint with `LEFT(endpoint, 34)`.
 *
 * Apple endpoints diverge early, so they separated and the output looked
 * right. Every FCM endpoint begins `https://fcm.googleapis.com/fcm/send/…` —
 * thirty-four characters lands inside that shared prefix, so ALL of a person's
 * Android and desktop registrations collapsed into a single row.
 *
 * Read on 24 September, account 160584 showed "fcm 51, apple 17, apple 17",
 * and the fcm number being exactly three times the others is what one row
 * hiding three endpoints looks like. The truth is FIVE endpoints — she
 * receives every notification five times. On that reading I had told the
 * tester "two Apple endpoints, 205 double deliveries in seven days", and
 * written the same into a migration's reasoning.
 *
 * The tool written to count endpoints was merging them. That is the recurring
 * fault — a number whose definition nobody asked for — inside the instrument.
 *
 * The label is now the push service plus eight characters of a digest, and the
 * GROUP BY is on the FULL endpoint, so no two can ever share a line again.
 * A digest also carries nothing: an endpoint and its keys are a capability to
 * push to somebody's phone (D149), and a terminal scrollback is not where that
 * belongs — which a prefix of the real thing was already edging towards.
 */
const push = readFileSync(join(__dirname, '..', '..', '..', 'scripts', 'ops', 'push.sh'), 'utf8');

describe('two endpoints can never share a line', () => {
  it('does not label an endpoint by a prefix every one of them shares', () => {
    expect(push).not.toContain('LEFT(d.endpoint, 34)');
    expect(push).not.toMatch(/LEFT\(d\.endpoint,\s*\d+\)\s+AS endpoint/);
  });

  it('labels by a digest, which is unique per endpoint', () => {
    expect(push).toContain('LEFT(MD5(d.endpoint), 8)');
  });

  /**
   * AND THE GROUPING IS THE REAL GUARD. A better label with a truncating GROUP
   * BY would still merge the rows and only print them under a prettier name.
   */
  it('groups on the label built from the whole endpoint, not on a prefix', () => {
    const perPerson = push.slice(push.indexOf('One person, by endpoint and by day'));

    expect(perPerson).toContain('MD5(d.endpoint)');
    expect(perPerson).toMatch(/GROUP BY 1, 2/);
    expect(perPerson).not.toContain('LEFT(d.endpoint');
  });
});

describe('the question row 101 actually asks is answered, not left to the eye', () => {
  /**
   * The per-endpoint rows say "is this one phone or two". They do not say how
   * many times the person hears it, which is the row's actual complaint — and
   * five endpoints inside a table of fifty lines is easy to miss. It is
   * counted and printed.
   */
  it('counts how many endpoints were pushed to on the most recent day', () => {
    expect(push).toContain('WAS PUSHED TO ON');
    expect(push).toContain('copies of every notification');
  });
});

/**
 * ROW 111 ASKS A DIFFERENT QUESTION FROM ROW 101, AND THE SAME TABLE ANSWERS
 * BOTH — so the unit has to be right or one row's measurement answers the
 * other's question.
 *
 * 101 is „how many copies does this person get" and counts ENDPOINTS.
 * 111 is „can the server reach this person at all" and counts PEOPLE.
 *
 * Counting rows for 111 would have read Lika's five endpoints as five people
 * becoming reachable, on the exact morning the frontend shipped the prompt
 * that is supposed to move that number.
 *
 * Baseline taken 24 September, before their prompt could have had any effect:
 * 5 of 45 reachable, and zero rows added on the 23rd or the 24th.
 */
describe('reach counts people, not rows', () => {
  it('counts distinct accounts, not subscriptions', () => {
    const reach = push.slice(push.indexOf('if [ "$WHO" = reach ]'));

    expect(reach).toContain('COUNT(DISTINCT ps.user_id)');
    expect(reach).toContain('AS people_reachable');
  });

  /** Seats are not the pilot. The same rule the rest of this file uses. */
  it('asks about real people only', () => {
    const reach = push.slice(push.indexOf('if [ "$WHO" = reach ]'));

    expect(reach).toContain('NOT EXISTS (SELECT 1 FROM test_seats');
    expect(reach).toContain('EXISTS (SELECT 1 FROM threads th');
  });

  /**
   * AND NO MOVEMENT IS A FINDING, NOT A BLANK. The frontend asked to hear
   * immediately if the number does not move, „and not in a week as a slow
   * suspicion" — so the script says it rather than leaving a reader to notice
   * two equal numbers.
   */
  it('says so out loud when nobody new became reachable', () => {
    expect(push).toContain('NOBODY NEW');
  });
});

/** D149, unchanged: no phone numbers, and now no piece of a real endpoint either. */
describe('it still carries nothing that could reach a phone', () => {
  it('names no phone column', () => {
    expect(push).not.toMatch(/target_phone|UserPhone/);
  });
});
