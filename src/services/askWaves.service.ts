import { query } from '../db/postgres/client';
import { askStateOf, isOpenAskState } from './askState';
import { phoneDigits } from './phone';
import { inWaveOrder, ownerGoalWords } from './waveOrder';
import { planInForce, type PlanPerson, type StoredPlan } from './taskPlans.service';
import type { Task } from './taskStore.service';

/**
 * #1685 (A2, D679/D680) — an approved plan asks its people in waves.
 *
 * Three at once for a small favour, five for real work. The next wave opens
 * when every ask of the current one is closed (answered, declined, expired —
 * „later" and held still count as open), or at the goal's silent-day wake,
 * whichever comes first. The plan's one yes covers every wave (D119), so the
 * owner is never asked again in between; the run is only told whom to write
 * to now.
 *
 * Who is next is the plan's own order (today's ranking) minus everyone this
 * goal already asked, in A8's order (waveOrder.ts: the owner-named person, the
 * pre-match word, the answer rate, then the plan's order).
 */
export const WAVE_SIZE_SMALL = 3;
export const WAVE_SIZE_REAL_WORK = 5;
/** Same span as the silent-day sweep (taskEngine SILENT_DAY_HOURS). */
export const NEXT_WAVE_AFTER_HOURS = 24;

const QUERY_TIMEOUT_MS = 5_000;

export function waveSize(plan: Pick<StoredPlan, 'real_work'>): number {
  return plan.real_work === true ? WAVE_SIZE_REAL_WORK : WAVE_SIZE_SMALL;
}

/** The plan's people not yet asked on this goal, in the plan's order. */
export function notYetAsked(
  people: readonly PlanPerson[],
  askedDigits: ReadonlySet<string>,
): PlanPerson[] {
  return people.filter((p) => !askedDigits.has(phoneDigits(p.phone)));
}

export interface WaveSnapshot {
  readonly wave: number;
  readonly size: number;
  /** Asks this wave has sent or holds. */
  readonly inWave: number;
  /** Of those, still waiting on the person (sent, seen, later, held). */
  readonly openInWave: number;
  /** The plan's people nobody has asked yet, in order. */
  readonly remaining: readonly PlanPerson[];
  readonly nextWaveAt: string | null;
}

interface WaveAskRow {
  status: string;
  declined_at: string | null;
  later_until: string | null;
  expired_at: string | null;
  seen_at: string | null;
}

async function readWaveNumber(
  taskId: number,
): Promise<{ wave: number; next_wave_at: string | null }> {
  const result = await query<{ ask_wave: number; next_wave_at: Date | null }>(
    `SELECT ask_wave, next_wave_at FROM tasks WHERE id = $1`,
    [taskId],
    QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return {
    wave: row?.ask_wave ?? 1,
    next_wave_at: row?.next_wave_at ? new Date(row.next_wave_at).toISOString() : null,
  };
}

async function readWaveAsks(taskId: number, wave: number): Promise<WaveAskRow[]> {
  const result = await query<WaveAskRow>(
    `SELECT status, declined_at, later_until, expired_at, seen_at FROM task_asks
      WHERE task_id = $1 AND wave_no = $2 AND parent_ask_id IS NULL
     UNION ALL
     SELECT 'held', NULL, NULL, NULL, NULL FROM held_asks
      WHERE task_id = $1 AND wave_no = $2 AND released_at IS NULL`,
    [taskId, wave],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** Every phone number this goal has asked or holds a question for, as digits. */
async function readAskedDigits(taskId: number): Promise<Set<string>> {
  const result = await query<{ digits: string }>(
    `SELECT regexp_replace(up.phone, '\\D', '', 'g') AS digits
       FROM "UserPhone" up
      WHERE up."userId" IN (SELECT to_user_id FROM task_asks WHERE task_id = $1)
     UNION
     SELECT regexp_replace(contact_phone, '\\D', '', 'g') FROM held_asks
      WHERE task_id = $1 AND contact_phone IS NOT NULL`,
    [taskId],
    QUERY_TIMEOUT_MS,
  );
  return new Set(result.rows.map((r) => r.digits));
}

/** The wave of a question held for this phone on this goal, if one still waits. */
async function heldWaveFor(taskId: number, digits: string): Promise<number | null> {
  const result = await query<{ wave_no: number | null }>(
    `SELECT wave_no FROM held_asks
      WHERE task_id = $1 AND released_at IS NULL
        AND regexp_replace(contact_phone, '\\D', '', 'g') = $2
      ORDER BY created_at DESC LIMIT 1`,
    [taskId, digits],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.wave_no ?? null;
}

/** Where this goal's waves stand; null when it has no approved plan. */
export async function readWave(
  task: Pick<Task, 'id' | 'plan' | 'plan_version' | 'plan_approved_at' | 'title'>,
): Promise<WaveSnapshot | null> {
  const plan = planInForce(task);
  if (plan === null || plan.approved_at === null) return null;
  const { wave, next_wave_at } = await readWaveNumber(task.id);
  const [asks, asked, ownerWords] = await Promise.all([
    readWaveAsks(task.id, wave),
    readAskedDigits(task.id),
    // A failed read ranks by the title alone, as before 49996.
    ownerGoalWords(task.id).catch(() => ''),
  ]);
  const now = new Date();
  return {
    wave,
    size: waveSize(plan),
    inWave: asks.length,
    openInWave: asks.filter((a) =>
      a.status === 'held' ? true : isOpenAskState(askStateOf(a, now)),
    ).length,
    remaining: await inWaveOrder(
      notYetAsked(plan.people_to_involve, asked),
      task.title,
      ownerWords,
    ),
    nextWaveAt: next_wave_at,
  };
}

/** Moves the goal from `from` to the next wave, once even if two callers race. */
async function openWaveAfter(taskId: number, from: number): Promise<boolean> {
  const result = await query(
    `UPDATE tasks SET ask_wave = ask_wave + 1, next_wave_at = NULL
      WHERE id = $1 AND ask_wave = $2`,
    [taskId, from],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}

/** Every ask of the open wave is closed and somebody is left: the next wave opens. */
export function waveIsDone(snapshot: WaveSnapshot): boolean {
  return snapshot.inWave > 0 && snapshot.openInWave === 0 && snapshot.remaining.length > 0;
}

/** At the silent-day wake the next wave opens even while some asks still wait. */
export function waveMayWiden(snapshot: WaveSnapshot): boolean {
  return snapshot.inWave > 0 && snapshot.remaining.length > 0;
}

export async function advanceWaveIfDone(
  task: Pick<Task, 'id' | 'plan' | 'plan_version' | 'plan_approved_at' | 'title'>,
): Promise<boolean> {
  const snapshot = await readWave(task);
  if (snapshot === null || !waveIsDone(snapshot)) return false;
  return openWaveAfter(task.id, snapshot.wave);
}

export async function widenWaveOnSilence(
  task: Pick<Task, 'id' | 'plan' | 'plan_version' | 'plan_approved_at' | 'title'>,
): Promise<boolean> {
  const snapshot = await readWave(task);
  if (snapshot === null || !waveMayWiden(snapshot)) return false;
  return openWaveAfter(task.id, snapshot.wave);
}

/**
 * NIGHT_QUESTIONS BD (1691, the tester's 49931): while a wave had room, anyone
 * not yet asked could be asked, so the model's own pick decided who went
 * first and the server's order was only advice. With this on, the room goes
 * to the next people in the server's order (A8), and anyone else is refused
 * with the line below. The person the owner named is never held back (D625).
 *
 * ON since Misho's yes on the exact line, 10 Oct ~06:20 UTC: „BD კი" (ADMIN_WRITE_OPERATIONS §123).
 * Off 10:55Z–(this commit) on box 50631; the refusal there was the wave cap's,
 * and its cause — the owner's named person not recognised — is fixed (4291).
 */
export const WAVE_ORDER_GATE_ON = true;

/** The wave's free places, filled in the server's order. */
export function nextInOrder(snapshot: WaveSnapshot): readonly PlanPerson[] {
  return snapshot.remaining.slice(0, Math.max(0, snapshot.size - snapshot.inWave));
}

/** NIGHT_QUESTIONS BD, the drafted line (10 Oct 04:10 UTC), awaiting Misho's yes. */
export function notInOrderLine(next: readonly PlanPerson[]): string {
  return (
    `ეს ადამიანი ჯერ არ არის რიგში. ამ ტალღაში ჯერ ამათ მისწერე: ${next
      .map((p) => p.name)
      .join(', ')}. ` +
    'დანარჩენები შემდეგ ტალღაში მიიღებენ — სერვერი თვითონ გეტყვის. მფლობელს არაფერს ეუბნები.'
  );
}

export type WaveRoom =
  | { readonly allowed: true; readonly wave: number | null }
  | { readonly allowed: false; readonly error: string };

/**
 * May this NEW plan candidate be asked now? `wave` is what the ask is stamped
 * with; null for anyone the waves do not count (no approved plan, not in the
 * plan, already asked on this goal, a question already held for them).
 */
export async function waveRoomFor(
  task: Pick<Task, 'id' | 'plan' | 'plan_version' | 'plan_approved_at' | 'title'>,
  contactPhone: string,
  /** Lazy, like the other D625 checks: asked only when the wave is full. */
  ownerNamedThem: () => Promise<boolean>,
): Promise<WaveRoom> {
  const plan = planInForce(task);
  if (plan === null || plan.approved_at === null) return { allowed: true, wave: null };
  const digits = phoneDigits(contactPhone);
  if (!plan.people_to_involve.some((p) => phoneDigits(p.phone) === digits)) {
    return { allowed: true, wave: null };
  }
  const snapshot = await readWave(task);
  if (snapshot === null) return { allowed: true, wave: null };
  if (!snapshot.remaining.some((p) => phoneDigits(p.phone) === digits)) {
    // Already asked on this goal, or a question held for them going out now:
    // it keeps the wave it was written in.
    return { allowed: true, wave: await heldWaveFor(task.id, digits) };
  }
  if (snapshot.inWave < snapshot.size) {
    const next = nextInOrder(snapshot);
    if (!WAVE_ORDER_GATE_ON || next.some((p) => phoneDigits(p.phone) === digits)) {
      return { allowed: true, wave: snapshot.wave };
    }
    // D625: the person the owner named himself is never held back.
    if (await ownerNamedThem()) return { allowed: true, wave: snapshot.wave };
    return { allowed: false, error: notInOrderLine(next) };
  }
  // D625: the person the owner named himself is never held back by a wave.
  if (await ownerNamedThem()) return { allowed: true, wave: snapshot.wave };
  return {
    allowed: false,
    error:
      `ამ ტალღის ${snapshot.size} კითხვა უკვე გაგზავნილია. შემდეგი ადამიანები მაშინ მიიღებენ, ` +
      'როცა ეს კითხვები დაიხურება, ან ჩუმი დღის გაღვიძებისას — სერვერი თვითონ გეტყვის. ' +
      'ახლა მეტს ნუ მისწერ; მფლობელს უთხარი, ვის ელოდები.',
  };
}

/** After an ask goes in a wave, the silent-day wake that would widen it moves a day on. */
export async function noteWaveAsk(taskId: number): Promise<void> {
  await query(
    `UPDATE tasks SET next_wave_at = NOW() + make_interval(hours => $2) WHERE id = $1`,
    [taskId, NEXT_WAVE_AFTER_HOURS],
    QUERY_TIMEOUT_MS,
  );
}

/** The run's instruction: whom to write to now. '' when no wave is waiting to go. */
export function nextWaveNote(snapshot: WaveSnapshot | null): string {
  if (snapshot === null) return '';
  if (snapshot.inWave > 0) {
    return (
      `\n\n## ტალღა ${snapshot.wave} (#1685)\n` +
      `გაგზავნილია ${snapshot.inWave}, ღიაა ${snapshot.openInWave}. ` +
      (snapshot.remaining.length > 0
        ? `შემდეგები (${snapshot.remaining
            .slice(0, snapshot.size)
            .map((p) => p.name)
            .join(', ')}) მიიღებენ, როცა ღია კითხვები დაიხურება ან ჩუმი დღის გაღვიძებისას` +
          (snapshot.nextWaveAt ? ` (${snapshot.nextWaveAt}, UTC)` : '') +
          ' — მანამდე მათ არ მისწერო.'
        : 'გეგმაში სხვა ადამიანი აღარ დარჩა.')
    );
  }
  const now = snapshot.remaining.slice(0, snapshot.size);
  if (now.length === 0) return '';
  const names = now.map((p) => p.name).join(', ');
  return (
    `\n\n## ტალღა ${snapshot.wave} — ახლა მისწერე (#1685)\n` +
    `ახლა ერთად მისწერე ამ ადამიანებს, გეგმის რიგით: ${names}. გეგმა დამტკიცებულია და ` +
    'ეს თვითონ არის თანხმობა (D119) — მფლობელს არაფერს ეკითხები. მეტს ამ ტალღაში ნუ მისწერ. ' +
    `ბოლოს მფლობელს ერთი ხაზით უთხარი: „ახლა ვეკითხები: ${names}".`
  );
}
