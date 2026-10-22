import { readFileSync } from 'fs';
import { join } from 'path';
import { HOUR_UPDATE_LINE_KA, hourUpdateInstruction } from '../taskEngine.service';

/** #5249 / D800: a goal that found nobody in its first hour says so, with a next step. */
describe('the one-hour honest update', () => {
  const store = readFileSync(join(__dirname, '..', 'taskStore.service.ts'), 'utf8');
  const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');
  const query = store.slice(store.indexOf('export async function getGoalsUnsolvedAfterAnHour('));

  it('is the approved line, word for word', () => {
    expect(HOUR_UPDATE_LINE_KA).toBe(
      'ჯერ ვერ ვიპოვე ის, ვინც ამას ზუსტად მოაგვარებს. შემდეგი ნაბიჯი: <ნაბიჯი>. გავაგრძელო?',
    );
    expect(hourUpdateInstruction()).toContain(HOUR_UPDATE_LINE_KA);
    expect(hourUpdateInstruction()).toContain('არავის არაფერი მისწერო');
  });

  it('reaches open goals an hour old that nobody answered, once each', () => {
    expect(query).toContain("t.status = 'open' AND t.hour_update_woken_at IS NULL");
    expect(query).toContain("t.created_at < NOW() - INTERVAL '60 minutes'");
    expect(query).toContain("t.created_at > NOW() - INTERVAL '6 hours'");
    expect(query).toContain("a.status = 'answered'");
  });

  it('leaves a goal whose introduction a go-between already accepted (#7238, 63229)', () => {
    expect(query).toContain('FROM introduction_requests ir');
    expect(query).toContain("ir.requester_task_id = t.id AND ir.status = 'accepted'");
  });

  it('leaves a goal whose plan or question waits on the owner', () => {
    // #6339: a new proposal waiting under an approved plan waits on the owner too.
    expect(query).toContain('AND t.plan_proposed IS NULL');
    expect(query).not.toContain('t.plan IS NULL');
    expect(query).toContain('t.pending_question IS NULL');
  });

  it('claims before it wakes, speaks Georgian only, and runs on every tick', () => {
    const sweep = engine.slice(
      engine.indexOf('export async function sweepGoalsUnsolvedAfterAnHour('),
    );
    // #5249 (69136): two containers in a deploy — only the one that wins the claim wakes it.
    expect(sweep).toContain('if (!(await claimHourUpdate(goal.id))) continue;');
    expect(sweep.indexOf('claimHourUpdate(goal.id)')).toBeLessThan(sweep.indexOf('wakeTask('));
    expect(sweep).toContain("!== 'ka') continue;");
    expect(engine).toContain('await sweepGoalsUnsolvedAfterAnHour().catch(');
  });
});

describe('#5249 (69136): the hour update is claimed once', () => {
  const store = readFileSync(join(__dirname, '..', 'taskStore.service.ts'), 'utf8');

  it('sets the stamp only from empty, and says whether it did', () => {
    const fn = store.slice(store.indexOf('export async function claimHourUpdate('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain('WHERE id = $1 AND hour_update_woken_at IS NULL');
    expect(body).toContain('RETURNING id');
    expect(body).toContain('return (result.rowCount ?? 0) > 0;');
  });
});
