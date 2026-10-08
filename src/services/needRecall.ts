import { query } from '../db/postgres/client';
import { fieldTerms, textSpeaksOf } from './prematch.service';
import { RunLanguage } from './runLanguage';

/**
 * 2608 (MASTER TEST RUN ME-027, 2 of 2): „გია საცდელს საწყობი სჭირდება."
 * was saved as Gia's need; twenty minutes later, in a new conversation,
 * „ნიკა საცდელს საწყობი აქვს გასაქირავებლად." was saved too — and Netai did
 * not remember Gia. When a new fact about one contact speaks of what the owner
 * said another contact needs, the reply recalls it and offers to connect the
 * two. Nothing is sent: the offer is a question with two buttons, and a yes
 * is an ordinary instruction for the next turn.
 */
const QUERY_TIMEOUT_MS = 5_000;
const NEEDS_READ = 50;

/** What one run saved, to be checked against the owner's saved needs at its end. */
const runSavedFacts = new Map<string, { readonly phone: string; readonly value: string }>();

export function noteSavedFact(
  runId: string | undefined,
  phone: string,
  fieldType: string,
  value: string,
): void {
  if (runId === undefined || fieldType === 'need' || value.trim() === '') return;
  runSavedFacts.set(runId, { phone, value });
}

export function takeSavedFact(
  runId: string,
): { readonly phone: string; readonly value: string } | null {
  const saved = runSavedFacts.get(runId) ?? null;
  runSavedFacts.delete(runId);
  return saved;
}

export interface RecalledNeed {
  readonly needName: string;
  readonly need: string;
  readonly helperName: string;
}

interface NeedRow {
  readonly phone: string;
  readonly value: string;
  readonly name: string | null;
}

/** The owner's saved need on ANOTHER contact that this new fact speaks of; null for none. */
export async function needThisFactMeets(
  userId: string,
  phone: string,
  value: string,
): Promise<RecalledNeed | null> {
  const needs = await query<NeedRow>(
    `SELECT cf.neo4j_contact_id AS phone, cf.value,
            (SELECT ua.alias FROM "UserAlias" ua
              WHERE ua."contactId" = $1::int AND ua.phone = cf.neo4j_contact_id LIMIT 1) AS name
       FROM contact_facts cf
      WHERE cf.submitted_by_user_id = $1::text AND cf.field_type = 'need'
        AND cf.retracted_at IS NULL AND cf.neo4j_contact_id <> $2
      ORDER BY cf.id DESC LIMIT $3`,
    [userId, phone, NEEDS_READ],
    QUERY_TIMEOUT_MS,
  );
  const met = needs.rows.find((n) => n.name !== null && textSpeaksOf(value, fieldTerms(n.value)));
  if (met === undefined || met.name === null) return null;
  const helper = await query<{ alias: string }>(
    `SELECT alias FROM "UserAlias" WHERE "contactId" = $1::int AND phone = $2 LIMIT 1`,
    [userId, phone],
    QUERY_TIMEOUT_MS,
  );
  const helperName = helper.rows[0]?.alias?.trim();
  if (!helperName) return null;
  return { needName: met.name.trim(), need: met.value.trim(), helperName };
}

const RECALL_LINE: Readonly<Record<RunLanguage, (r: RecalledNeed) => string>> = {
  ka: (r) =>
    `გახსოვს, ${r.needName}-ს სჭირდება: „${r.need}". ${r.helperName} შეიძლება დაეხმაროს — დავაკავშირო ისინი?`,
  en: (r) =>
    `You told me ${r.needName} needs: „${r.need}". ${r.helperName} may be able to help — shall I connect them?`,
  ru: (r) =>
    `Ты говорил, что ${r.needName} нужно: «${r.need}». ${r.helperName} может помочь — связать их?`,
  es: (r) =>
    `Me dijiste que ${r.needName} necesita: «${r.need}». ${r.helperName} podría ayudar: ¿los pongo en contacto?`,
};

const RECALL_CHOICES: Readonly<Record<RunLanguage, readonly string[]>> = {
  ka: ['კი, დააკავშირე', 'არა, ჯერ არა'],
  en: ['Yes, connect them', 'Not now'],
  ru: ['Да, свяжи их', 'Пока нет'],
  es: ['Sí, ponlos en contacto', 'Ahora no'],
};

export function recallLine(language: RunLanguage, recalled: RecalledNeed): string {
  return (RECALL_LINE[language] ?? RECALL_LINE.ka)(recalled);
}

export function recallChoices(language: RunLanguage): string[] {
  return [...(RECALL_CHOICES[language] ?? RECALL_CHOICES.ka)];
}
