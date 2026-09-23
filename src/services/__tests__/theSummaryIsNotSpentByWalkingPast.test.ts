import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ROW 230 (D462) — THE CARD SURVIVES SOMEBODY OPENING THE SCREEN, AND THE
 * RECORD HAS TO AGREE WITH THE SCREEN.
 *
 * The founder decided on 23 September that the weekly summary is a card of its
 * own at the top of the updates screen, staying until the person opens it, and
 * — his answer to my own second question — „the card must NOT be spent by
 * merely opening the screen."
 *
 * THE FRONTEND BUILT IT AND THEN REPORTED THE HALF THEY COULD NOT KEEP, which
 * nobody asked them to do. Their side finds the summary in `due` OR `seen`, so
 * the card stays visually — but `GET /updates` had already written „seen" into
 * the row. Their words: „ჩანაწერი ტყუის" — the record lies. If anybody ever
 * measures how many people read the weekly summary, that number is wrong, and
 * wrong in the exact way this project has spent a week hunting: a record that
 * claims more than happened.
 *
 * WHY THE HISTORY MATTERS. `getPendingUpdates` marks what it releases as seen
 * ON PURPOSE — row 73 was about the opposite fault, a screen that showed
 * updates without spending them, and the comment at the top of the route says
 * so in those words. This is a narrow, named exception with a tap behind it,
 * not a loosening of that rule.
 */
describe('a weekly summary is released without being spent', () => {
  const service = readFileSync(join(__dirname, '..', 'pendingUpdates.service.ts'), 'utf8');

  it('names the kind that is shown but not spent', () => {
    expect(service).toContain("const UNSPENT_KINDS = ['weekly_summary'];");
  });

  it('leaves its status and its release time exactly as they were', () => {
    const at = service.indexOf('UPDATE pending_updates pu');
    const update = service.slice(at, at + 900);

    expect(update).toContain('WHEN pu.kind = ANY($6::text[]) THEN pu.status');
    expect(update).toContain('WHEN pu.kind = ANY($6::text[]) THEN pu.release_at');
  });

  /**
   * NOT THE SAME AS STICKY, and the order of the CASE is what keeps them
   * apart: a sticky item goes back to held WITH a cooldown because it is a
   * question waiting for an answer and must return on its own. A summary waits
   * for nothing and there is one a week.
   */
  it('is decided before the sticky branch, not folded into it', () => {
    const at = service.indexOf('UPDATE pending_updates pu');
    const update = service.slice(at, at + 900);

    expect(update.indexOf('ANY($6::text[]) THEN pu.status')).toBeLessThan(
      update.indexOf("ANY($3::text[]) THEN 'held'"),
    );
  });

  it('passes the kinds to the query rather than leaving the parameter unbound', () => {
    const at = service.indexOf('MAX_BLOCKING_QUESTIONS_PER_READ,');
    expect(service.slice(at, at + 120)).toContain('UNSPENT_KINDS,');
  });
});

describe('and the tap is what spends it', () => {
  const service = readFileSync(join(__dirname, '..', 'pendingUpdates.service.ts'), 'utf8');
  const route = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'updates.routes.ts'),
    'utf8',
  );

  it('is scoped to the owner, so another account’s row is a no-op', () => {
    const at = service.indexOf('export async function markUpdateSeen');
    expect(service.slice(at, at + 400)).toContain('WHERE id = $1 AND user_id = $2');
  });

  it('is reachable as its own route on the same identifier as the rest', () => {
    expect(route).toContain("'/:ref/seen'");
    expect(route).toContain('await markUpdateSeen(userId, id)');
  });

  /**
   * A WRONG REF IS A 404 AND NOT A QUIET 200. „Nothing was updated" looking
   * like success is how a frontend ends up believing a tap landed.
   */
  it('says so when there was nothing of theirs to mark', () => {
    const at = route.indexOf("'/:ref/seen'");
    expect(route.slice(at, at + 1200)).toContain('No such update of yours.');
  });
});

/**
 * AND THE NAME OF THE PER-GOAL FIELD IS PINNED, BECAUSE THE FRONTEND ASKED FOR
 * THAT AND WAS RIGHT TO.
 *
 * They shipped the card reading three spellings — `goals`, `per_goal`,
 * `breakdown` — so that whichever one the payload used would work, and then
 * asked me to settle on one so the three-way read does not live in their code
 * for ever. Their comparison: the same trap `members` / `results` set for them
 * once already.
 *
 * It is `goals`, and this is what stops it drifting. A field the other side
 * reads by name is part of the contract whether or not anybody wrote it down,
 * and „whatever you have will work" is how two names both end up permanent.
 */
describe('the weekly summary payload keeps the names the screen reads', () => {
  const summary = readFileSync(join(__dirname, '..', 'weeklySummary.service.ts'), 'utf8');
  const at = summary.indexOf('export async function sendWeeklySummary');
  const queued = summary.slice(at, at + 1400);

  it.each([['goals'], ['week_start'], ['text']])('carries %s', (field) => {
    expect(queued).toContain(`${field}:`);
  });

  it('spells the per-goal list one way and not three', () => {
    expect(queued).toContain('goals: summary.goals.map');
    expect(queued).not.toContain('per_goal');
    expect(queued).not.toContain('breakdown');
  });

  it.each([['task_id'], ['title'], ['asks_sent'], ['asks_answered'], ['pending_question']])(
    'each goal carries %s',
    (field) => {
      expect(queued).toContain(`${field}:`);
    },
  );
});
