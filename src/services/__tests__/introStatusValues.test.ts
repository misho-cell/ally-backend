import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Row 232, second pass — I wrote a status the table does not allow, and the
 * only thing that caught it was a log line.
 *
 * `cancelIntroductionRequestsForTask` shipped at 15:34 writing
 * `status = 'cancelled'`. At 15:38:20 the seat stopped goal 7327 and the
 * request stayed pending. They offered two hypotheses — no task link, or the
 * deploy not live — and both were wrong: `requester_task_id` is 7327 on row
 * 1354, and the build logged „Server listening" at 15:34:23, four minutes
 * before the stop. The answer was in the deployment log:
 *
 *   new row for relation "introduction_requests" violates check constraint
 *
 * `introduction_requests_status_check` allowed pending | accepted | declined.
 * I added a fourth state to the code and not to the table, and the
 * best-effort catch around that update — which exists so a failed withdrawal
 * cannot fail a stop — turned a crash into a silence.
 *
 * A unit test cannot reach Postgres. What it CAN do is hold the two lists
 * against each other: every status this service writes must appear in the
 * constraint the migrations leave behind. That is the check I skipped.
 */
const SERVICE = readFileSync(join(__dirname, '..', 'introduction.service.ts'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

const MIGRATIONS = join(__dirname, '..', '..', 'db', 'postgres', 'migrations');

/** The newest definition of the status CHECK, as the database will hold it. */
function allowedStatuses(): string[] {
  const files = readdirSync(MIGRATIONS).sort();
  let allowed: string[] = [];
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    const block = /introduction_requests_status_check[\s\S]*?CHECK\s*\(([\s\S]*?)\);/i.exec(sql);
    if (!block) continue;
    const found = [...block[1].matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);
    if (found.length > 0) allowed = found;
  }
  return allowed;
}

/** Every literal this service assigns to `status`. */
function statusesWritten(): string[] {
  return [...SERVICE.matchAll(/SET status = '([a-z_]+)'/g)].map((m) => m[1]);
}

describe('every status the code writes is one the table allows', () => {
  it('finds the constraint at all', () => {
    expect(allowedStatuses()).toEqual(
      expect.arrayContaining(['pending', 'accepted', 'declined', 'cancelled']),
    );
  });

  it('writes nothing outside it', () => {
    const allowed = allowedStatuses();
    const written = statusesWritten();
    expect(written.length).toBeGreaterThan(0);
    for (const status of written) expect(allowed).toContain(status);
  });
});

/**
 * And the value means what it says. „declined" was the easy way out of the
 * constraint and it would have been a lie: it says the MEDIATOR refused, and
 * they did not — the requester withdrew. A withdrawal and a refusal are
 * different facts about a real person's behaviour, and this whole row exists
 * because the mediator was being treated carelessly.
 */
describe('a withdrawal is not a refusal', () => {
  it('cancels rather than declining', () => {
    const fn = SERVICE.slice(
      SERVICE.indexOf('export async function cancelIntroductionRequestsForTask'),
    );
    expect(fn).toContain("SET status = 'cancelled'");
    expect(fn).not.toContain("SET status = 'declined'");
  });

  /** Nobody responded, so no response time is stamped. */
  it('leaves responded_at alone', () => {
    const fn = SERVICE.slice(
      SERVICE.indexOf('export async function cancelIntroductionRequestsForTask'),
    );
    const update = fn.slice(fn.indexOf('UPDATE introduction_requests'), fn.indexOf('RETURNING'));
    expect(update).not.toContain('responded_at');
  });
});
