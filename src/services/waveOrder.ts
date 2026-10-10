import { query } from '../db/postgres/client';
import { askField } from './answerStats.service';
import { phoneDigits } from './phone';
import { Prematch, prematchMany, PrematchWord } from './prematch.service';

/**
 * 1691 (A8, D679/D680): whom to ask first was decided by labels and
 * relationship strength only. The order of a wave is now, in this order:
 *
 *   1. the person the owner named himself (D625);
 *   2. the pre-match class (A11): likely_yes, possibly, ask_him — and
 *      not_his_field only when nobody else is left;
 *   3. within a class, the answer rate for this field,
 *      (yes + referred + 1) / (asked + 2), then the overall answer rate;
 *   4. then today's order, which is the plan's.
 *
 * The two signals stay two numbers on their records (the ask's pre-match word,
 * the person's answer_stats); nothing merged is stored. A failed read keeps
 * the plan's order: ranking helps, it never gates.
 */
const QUERY_TIMEOUT_MS = 5_000;
const ROWS_READ = 2_000;

export const CLASS_RANK: Readonly<Record<PrematchWord, number>> = {
  [PrematchWord.LikelyYes]: 0,
  [PrematchWord.Possibly]: 1,
  [PrematchWord.AskHim]: 2,
  [PrematchWord.NotHisField]: 3,
};

export interface AnswerRates {
  /** (yes + referred + 1) / (asked + 2) in this field. */
  readonly field: number;
  /** The same over every field. */
  readonly overall: number;
}

/** No record at all reads as one in two — the prior, not a guess either way. */
const NO_RECORD: AnswerRates = { field: 0.5, overall: 0.5 };

export function answerRate(yes: number, referred: number, asked: number): number {
  return (yes + referred + 1) / (asked + 2);
}

/** Does the goal's own text name this person (every word of the name)? */
export function goalNamesPerson(goalText: string, name: string): boolean {
  const text = goalText.toLowerCase();
  const words = name
    .toLowerCase()
    .split(/\s+/u)
    .filter((w) => w.length >= 2);
  return words.length > 0 && words.every((w) => text.includes(w.length >= 4 ? w.slice(0, -1) : w));
}

export interface WaveOrderInput {
  readonly words: ReadonlyMap<string, Prematch>;
  readonly rates: ReadonlyMap<string, AnswerRates>;
  /** Where a person the owner named is looked for: the title and the owner's own lines. */
  readonly goalText: string;
}

/**
 * The tester's 49996 (1691, 0 of 1): „…პირველ რიგში ციცინო ფილტრაძეს ჰკითხე,
 * მერე სხვებსაც." — and she ranked last. The title is the model's wording of
 * the goal and left her out; the owner's own lines in the goal's conversation
 * are where he names people. Bounded, newest first, from just before the
 * goal was opened.
 */
const OWNER_LINES_READ = 20;
const OWNER_LINE_CHARS = 500;
const OWNER_LINES_FROM_MINUTES = 10;

export async function ownerGoalWords(taskId: number): Promise<string> {
  const result = await query<{ content: string }>(
    `SELECT LEFT(c.content, $2) AS content
       FROM tasks t
       JOIN conversations c ON c.thread_id = t.thread_id
      WHERE t.id = $1 AND c.role = 'user' AND COALESCE(c.kind, '') <> 'event'
        AND c.content <> ''
        AND c.created_at >= t.created_at - make_interval(mins => $3)
      ORDER BY c.created_at DESC
      LIMIT $4`,
    [taskId, OWNER_LINE_CHARS, OWNER_LINES_FROM_MINUTES, OWNER_LINES_READ],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => r.content).join('\n');
}

/** The candidates in A8's order; the plan's order breaks every tie. */
export function orderCandidates<T extends { readonly phone: string; readonly name: string }>(
  people: readonly T[],
  input: WaveOrderInput,
): T[] {
  const keyOf = (p: T): readonly number[] => {
    const d = phoneDigits(p.phone);
    const word = input.words.get(d)?.word ?? PrematchWord.AskHim;
    const rates = input.rates.get(d) ?? NO_RECORD;
    return [
      goalNamesPerson(input.goalText, p.name) ? 0 : 1,
      CLASS_RANK[word],
      -rates.field,
      -rates.overall,
    ];
  };
  return people
    .map((person, index) => ({ person, index, key: keyOf(person) }))
    .sort((a, b) => {
      for (let i = 0; i < a.key.length; i += 1) {
        if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i];
      }
      return a.index - b.index;
    })
    .map(({ person }) => person);
}

interface StatsRow {
  readonly phone: string;
  readonly field: string;
  readonly asked: number;
  readonly yes: number;
  readonly referred: number;
}

/** Each candidate's answer rates, from answer_stats (by index on the phone's stored forms). */
export async function answerRatesFor(
  phones: readonly string[],
  field: string,
): Promise<Map<string, AnswerRates>> {
  const digits = [...new Set(phones.map(phoneDigits).filter((d) => d !== ''))];
  const out = new Map<string, AnswerRates>();
  if (digits.length === 0) return out;
  const forms = [...new Set(digits.flatMap((d) => [`+${d}`, d]))];
  const result = await query<StatsRow>(
    `SELECT up.phone, s.field, s.asked, s.yes, s.referred
       FROM "UserPhone" up
       JOIN answer_stats s ON s.user_id = up."userId"
      WHERE up.phone = ANY($1::text[])
      LIMIT $2`,
    [forms, ROWS_READ],
    QUERY_TIMEOUT_MS,
  );
  const totals = new Map<string, { asked: number; yes: number; referred: number }>();
  const inField = new Map<string, number>();
  for (const row of result.rows) {
    const d = phoneDigits(row.phone);
    const t = totals.get(d) ?? { asked: 0, yes: 0, referred: 0 };
    totals.set(d, {
      asked: t.asked + row.asked,
      yes: t.yes + row.yes,
      referred: t.referred + row.referred,
    });
    if (row.field === field) inField.set(d, answerRate(row.yes, row.referred, row.asked));
  }
  for (const [d, t] of totals) {
    out.set(d, {
      field: inField.get(d) ?? answerRate(0, 0, 0),
      overall: answerRate(t.yes, t.referred, t.asked),
    });
  }
  return out;
}

/** The wave's people in A8's order; the plan's order when anything cannot be read. */
export async function inWaveOrder<T extends { readonly phone: string; readonly name: string }>(
  people: readonly T[],
  goalText: string | null,
  ownerWords = '',
): Promise<T[]> {
  if (people.length < 2) return [...people];
  try {
    return orderCandidates(people, await waveSignals(people, goalText ?? '', ownerWords));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[wave-order] kept as planned:', (err as Error).message);
    return [...people];
  }
}

/** What the order is made of: each person's pre-match word and answer rates. */
async function waveSignals(
  people: readonly { readonly phone: string }[],
  goalText: string,
  ownerWords: string,
): Promise<WaveOrderInput> {
  const phones = people.map((p) => p.phone);
  const [words, rates] = await Promise.all([
    prematchMany(phones, goalText),
    answerRatesFor(phones, askField(goalText)),
  ]);
  return { words, rates, goalText: ownerWords === '' ? goalText : `${goalText}\n${ownerWords}` };
}

export interface RankedCandidate {
  readonly rank: number;
  readonly name: string;
  readonly named_by_goal: boolean;
  readonly prematch: PrematchWord;
  readonly field_rate: number;
  readonly overall_rate: number;
}

/**
 * The tester's 49931 (1691): the same order the waves use, with the signals
 * that made it, so the ranking can be judged without the model's plan
 * choosing who is in it. Unlike inWaveOrder, a failed read is an error here.
 */
export async function rankingOf<T extends { readonly phone: string; readonly name: string }>(
  people: readonly T[],
  goalText: string,
  ownerWords = '',
): Promise<RankedCandidate[]> {
  const input = await waveSignals(people, goalText, ownerWords);
  return orderCandidates(people, input).map((p, index) => {
    const d = phoneDigits(p.phone);
    const rates = input.rates.get(d) ?? NO_RECORD;
    return {
      rank: index + 1,
      name: p.name,
      named_by_goal: goalNamesPerson(input.goalText, p.name),
      prematch: input.words.get(d)?.word ?? PrematchWord.AskHim,
      field_rate: rates.field,
      overall_rate: rates.overall,
    };
  });
}
