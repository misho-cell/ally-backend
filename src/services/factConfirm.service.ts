import { query } from '../db/postgres/client';
import { FACT_FIELD_TYPES, submitContactFact } from './contactFacts.service';
import { RunLanguage } from './runLanguage';
import { whereNowValue } from './whereNowValue';

/**
 * 1690 (A7, the intelligence research of 6 October, D679/D680): job facts go
 * stale at about 1% a month and nobody fills a survey to refresh them. So the
 * owner is asked at the moment of use — when a search hands the run one of the
 * four core facts (occupation, employer, city, industry) that HE saved about a
 * contact, older than 180 days, never confirmed, never asked: one line, three
 * taps, by the server, at most one per conversation a day.
 *
 *   „yes"       → last_confirmed_at;
 *   „not sure"  → nothing more; not asked again for 180 days;
 *   „no longer" → „where now?" once; his next short line is saved as a new
 *                 fact from him (the old one is kept, never deleted).
 *
 * Every step is the server's: no model text, no settings page (D32).
 */
const QUERY_TIMEOUT_MS = 5_000;
export const CONFIRM_AFTER_DAYS = 180;
const ONE_CONFIRM_PER_THREAD_HOURS = 24;
const TAP_VALID_HOURS = 24;
const WHERE_NOW_VALID_MINUTES = 60;
const WHERE_NOW_MAX_CHARS = 80;
const PHONES_READ = 50;

export enum ConfirmTap {
  Yes = 'yes',
  No = 'no',
  NotSure = 'not_sure',
}

interface ConfirmTexts {
  readonly ask: (name: string, value: string) => string;
  readonly labels: Readonly<Record<ConfirmTap, string>>;
  readonly kept: string;
  readonly notSure: string;
  readonly whereNow: Readonly<Record<string, (name: string) => string>>;
  readonly saved: (name: string, value: string) => string;
}

const TEXTS: Readonly<Record<'ka' | 'en', ConfirmTexts>> = {
  ka: {
    ask: (name, value) => `შენახული მაქვს: ${name} — „${value}". ისევ ასეა?`,
    labels: {
      [ConfirmTap.Yes]: 'კი, ასეა',
      [ConfirmTap.No]: 'აღარ',
      [ConfirmTap.NotSure]: 'არ ვიცი',
    },
    kept: 'კარგი, ასე დავტოვებ.',
    notSure: 'კარგი, ჯერ ასე დავტოვებ.',
    whereNow: {
      employer: (name) => `ახლა სად მუშაობს ${name}?`,
      occupation: (name) => `ახლა რას საქმიანობს ${name}?`,
      city: (name) => `ახლა რომელ ქალაქშია ${name}?`,
      industry: (name) => `ახლა რომელ სფეროშია ${name}?`,
    },
    saved: (name, value) => `დავიმახსოვრე: ${name} — „${value}".`,
  },
  en: {
    ask: (name, value) => `You have „${value}" saved for ${name}. Is that still right?`,
    labels: {
      [ConfirmTap.Yes]: 'Yes',
      [ConfirmTap.No]: 'No longer',
      [ConfirmTap.NotSure]: 'Not sure',
    },
    kept: 'Good, I keep it.',
    notSure: 'Fine, I keep it for now.',
    whereNow: {
      employer: (name) => `Where does ${name} work now?`,
      occupation: (name) => `What does ${name} do now?`,
      city: (name) => `Which city is ${name} in now?`,
      industry: (name) => `Which field is ${name} in now?`,
    },
    saved: (name, value) => `Saved: ${name} — „${value}".`,
  },
};

function textsFor(language: RunLanguage): ConfirmTexts {
  return language === 'ka' ? TEXTS.ka : TEXTS.en;
}

export interface StaleFact {
  readonly id: number;
  readonly phone: string;
  readonly field_type: string;
  readonly value: string;
  readonly name: string;
}

/** One old, unconfirmed, never-asked core fact the owner saved about one of these numbers. */
export async function staleCoreFact(
  ownerId: string,
  phones: readonly string[],
): Promise<StaleFact | null> {
  if (phones.length === 0) return null;
  const result = await query<StaleFact>(
    `SELECT cf.id, cf.neo4j_contact_id AS phone, cf.field_type, cf.value,
            (SELECT MAX(NULLIF(TRIM(ua.alias), '')) FROM "UserAlias" ua
              WHERE ua.phone = cf.neo4j_contact_id AND ua."contactId" = $1::int) AS name
       FROM contact_facts cf
      WHERE cf.submitted_by_user_id = $1::text
        AND cf.neo4j_contact_id = ANY($2::text[])
        AND cf.field_type = ANY($3::text[])
        AND cf.retracted_at IS NULL
        AND cf.created_at < NOW() - make_interval(days => $4)
        AND cf.last_confirmed_at IS NULL AND cf.confirmed_by_result_at IS NULL
        AND (cf.confirm_asked_at IS NULL OR cf.confirm_asked_at < NOW() - make_interval(days => $4))
      ORDER BY cf.created_at ASC
      LIMIT 1`,
    [ownerId, phones.slice(0, PHONES_READ), [...FACT_FIELD_TYPES], CONFIRM_AFTER_DAYS],
    QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return row !== undefined && (row.name ?? '').trim() !== '' ? row : null;
}

/** Was a confirm question already shown in this conversation today? */
async function askedHereToday(threadId: number): Promise<boolean> {
  const result = await query<{ asked: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM fact_confirms WHERE thread_id = $1
                     AND asked_at > NOW() - make_interval(hours => $2)) AS asked`,
    [threadId, ONE_CONFIRM_PER_THREAD_HOURS],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.asked === true;
}

export interface ConfirmCard {
  readonly text: string;
  readonly choices: readonly string[];
}

/** The card for one stale fact, recorded as asked; null when none is due here. */
export async function confirmCardFor(
  ownerId: string,
  threadId: number,
  phones: readonly string[],
  language: RunLanguage,
): Promise<ConfirmCard | null> {
  if (await askedHereToday(threadId)) return null;
  const fact = await staleCoreFact(ownerId, phones);
  if (fact === null) return null;
  await query(
    `WITH asked AS (UPDATE contact_facts SET confirm_asked_at = NOW() WHERE id = $3 RETURNING id)
     INSERT INTO fact_confirms (user_id, thread_id, fact_id, phone, field_type, name, value)
     VALUES ($1::int, $2, $3, $4, $5, $6, $7)`,
    [ownerId, threadId, fact.id, fact.phone, fact.field_type, fact.name, fact.value],
    QUERY_TIMEOUT_MS,
  );
  const t = textsFor(language);
  return {
    text: t.ask(fact.name, fact.value),
    choices: [t.labels[ConfirmTap.Yes], t.labels[ConfirmTap.No], t.labels[ConfirmTap.NotSure]],
  };
}

/** Which of the three buttons this line is, in any language; null when it is none. */
export function confirmTapOf(line: string): ConfirmTap | null {
  const said = line.trim().toLowerCase();
  for (const t of Object.values(TEXTS)) {
    for (const tap of Object.values(ConfirmTap)) {
      if (t.labels[tap].toLowerCase() === said) return tap;
    }
  }
  return null;
}

interface OpenConfirm {
  readonly id: number;
  readonly fact_id: number;
  readonly phone: string;
  readonly field_type: string;
  readonly name: string;
  readonly state: string;
}

async function openConfirmIn(threadId: number): Promise<OpenConfirm | null> {
  const result = await query<OpenConfirm>(
    `SELECT id, fact_id, phone, field_type, name, state FROM fact_confirms
      WHERE thread_id = $1
        AND ((state = 'asked' AND asked_at > NOW() - make_interval(hours => $2))
          OR (state = 'no_waiting' AND answered_at > NOW() - make_interval(mins => $3)))
      ORDER BY asked_at DESC LIMIT 1`,
    [threadId, TAP_VALID_HOURS, WHERE_NOW_VALID_MINUTES],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

async function settle(id: number, state: string): Promise<void> {
  await query(
    `UPDATE fact_confirms SET state = $2, answered_at = NOW() WHERE id = $1`,
    [id, state],
    QUERY_TIMEOUT_MS,
  );
}

/**
 * The owner's line, read against an open confirm in this conversation: the
 * server's reply when it settled it, or null when the line is about something
 * else (then the run answers it as always, and a waiting „where now?" lapses).
 */
export async function answerConfirm(
  ownerId: string,
  threadId: number,
  line: string,
  languageOf: () => Promise<RunLanguage>,
): Promise<string | null> {
  const open = await openConfirmIn(threadId);
  if (open === null) return null;
  const t = textsFor(await languageOf());
  if (open.state === 'no_waiting') {
    const said = line.trim();
    if (said === '' || said.length > WHERE_NOW_MAX_CHARS || confirmTapOf(said) !== null) {
      await settle(open.id, 'dropped');
      return null;
    }
    const value = whereNowValue(said);
    await submitContactFact(ownerId, open.phone, open.field_type, value, 'chat', 'stated');
    await settle(open.id, 'no_saved');
    return t.saved(open.name, value);
  }
  const tap = confirmTapOf(line);
  if (tap === null) return null;
  if (tap === ConfirmTap.Yes) {
    await query(
      `UPDATE contact_facts SET last_confirmed_at = NOW() WHERE id = $1`,
      [open.fact_id],
      QUERY_TIMEOUT_MS,
    );
    await settle(open.id, 'yes');
    return t.kept;
  }
  if (tap === ConfirmTap.NotSure) {
    await settle(open.id, 'not_sure');
    return t.notSure;
  }
  await settle(open.id, 'no_waiting');
  const ask = t.whereNow[open.field_type] ?? t.whereNow.employer;
  return ask(open.name);
}

/**
 * A result confirms the facts that picked the helper: a „helped" debrief marks
 * the asker's core facts about the asked person as confirmed by result.
 */
export async function confirmByResult(askerId: string, helperUserId: number): Promise<void> {
  await query(
    `UPDATE contact_facts cf SET confirmed_by_result_at = NOW()
      WHERE cf.submitted_by_user_id = $1::text
        AND cf.field_type = ANY($3::text[])
        AND cf.retracted_at IS NULL
        AND cf.neo4j_contact_id IN (SELECT phone FROM "UserPhone" WHERE "userId" = $2)`,
    [askerId, helperUserId, [...FACT_FIELD_TYPES]],
    QUERY_TIMEOUT_MS,
  );
}
