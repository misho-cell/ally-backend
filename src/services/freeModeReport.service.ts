import { query } from '../db/postgres/client';
import { RunLanguage } from './runLanguage';
import { LOCAL_ZONE, localDayStartSql } from './workMode';

/**
 * Misho, 8 Nov: a free-mode goal writes without asking the owner each time,
 * so he hears ONCE each evening whom it wrote to that day and who answered.
 * A goal that wrote to nobody that day sends nothing.
 */
export const FREE_REPORT_LOCAL_HOUR = 20;
const REPORT_QUERY_TIMEOUT_MS = 5_000;
const MAX_REPORTS_PER_SWEEP = 50;
const MAX_PEOPLE_READ = 50;
const UNNAMED_PERSON = '—';

export interface DueFreeReport {
  readonly id: number;
  readonly user_id: string;
  readonly thread_id: number;
  readonly title: string;
}

export interface ReportedPerson {
  readonly name: string;
  readonly answered: boolean;
}

/**
 * Claims the free-mode goals whose evening has come and that wrote to someone today,
 * marking today's report as taken in the same statement — a goal is reported once.
 */
export async function claimDueFreeReports(): Promise<DueFreeReport[]> {
  const result = await query<DueFreeReport>(
    `UPDATE tasks SET free_report_date = (NOW() AT TIME ZONE $1)::date
      WHERE id IN (
        SELECT t.id FROM tasks t
         WHERE t.work_mode = 'free' AND t.status = 'open' AND t.thread_id IS NOT NULL
           AND EXTRACT(HOUR FROM NOW() AT TIME ZONE $1) >= $2
           AND t.free_report_date IS DISTINCT FROM (NOW() AT TIME ZONE $1)::date
           AND EXISTS (SELECT 1 FROM task_asks a
                        WHERE a.task_id = t.id AND a.created_at >= ${localDayStartSql(1)})
         ORDER BY t.id
         LIMIT $3
         FOR UPDATE SKIP LOCKED)
      RETURNING id, user_id::text AS user_id, thread_id, title`,
    [LOCAL_ZONE, FREE_REPORT_LOCAL_HOUR, MAX_REPORTS_PER_SWEEP],
    REPORT_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** The people a goal wrote to today, each once, and whether they answered. */
export async function peopleWrittenToToday(taskId: number): Promise<ReportedPerson[]> {
  const result = await query<{ name: string | null; answered: boolean }>(
    `SELECT MAX(u.name) AS name, BOOL_OR(a.status = 'answered') AS answered
       FROM task_asks a
       LEFT JOIN users u ON u.id = a.to_user_id
      WHERE a.task_id = $1 AND a.created_at >= ${localDayStartSql(2)}
      GROUP BY a.to_user_id
      ORDER BY MIN(a.created_at)
      LIMIT $3`,
    [taskId, LOCAL_ZONE, MAX_PEOPLE_READ],
    REPORT_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    name: r.name?.trim() || UNNAMED_PERSON,
    answered: r.answered,
  }));
}

interface ReportWords {
  readonly wrote: (title: string, count: number, names: string) => string;
  readonly answered: (names: string) => string;
}

const REPORT_WORDS: Readonly<Record<RunLanguage, ReportWords>> = {
  ka: {
    wrote: (t, n, names) => `დღევანდელი ანგარიში — „${t}": მივწერე ${n} ადამიანს: ${names}.`,
    answered: (names) => ` უკვე უპასუხა: ${names}.`,
  },
  en: {
    wrote: (t, n, names) =>
      `Today on „${t}": I wrote to ${n} ${n === 1 ? 'person' : 'people'}: ${names}.`,
    answered: (names) => ` Already answered: ${names}.`,
  },
  ru: {
    wrote: (t, n, names) => `Итог дня по цели «${t}»: написал людям (${n}): ${names}.`,
    answered: (names) => ` Уже ответили: ${names}.`,
  },
  es: {
    wrote: (t, n, names) => `Resumen de hoy sobre «${t}»: escribí a ${n} persona(s): ${names}.`,
    answered: (names) => ` Ya respondieron: ${names}.`,
  },
};

/** The one evening line; '' when nobody was written to. */
export function freeReportText(
  title: string,
  people: readonly ReportedPerson[],
  language: RunLanguage,
): string {
  if (people.length === 0) return '';
  const words = REPORT_WORDS[language];
  const answered = people.filter((p) => p.answered).map((p) => p.name);
  const line = words.wrote(title, people.length, people.map((p) => p.name).join(', '));
  return answered.length === 0 ? line : line + words.answered(answered.join(', '));
}
