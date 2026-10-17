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

  it('leaves a goal whose plan or question waits on the owner', () => {
    expect(query).toContain('NOT (t.plan_proposed IS NOT NULL AND t.plan IS NULL)');
    expect(query).toContain('t.pending_question IS NULL');
  });

  it('stamps before it wakes, speaks Georgian only, and runs on every tick', () => {
    const sweep = engine.slice(
      engine.indexOf('export async function sweepGoalsUnsolvedAfterAnHour('),
    );
    expect(sweep.indexOf('markHourUpdateWoken(goal.id)')).toBeLessThan(sweep.indexOf('wakeTask('));
    expect(sweep).toContain("!== 'ka') continue;");
    expect(engine).toContain('await sweepGoalsUnsolvedAfterAnHour().catch(');
  });
});
