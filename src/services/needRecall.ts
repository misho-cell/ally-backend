import { query } from '../db/postgres/client';
import { geoName } from './georgianCase';
import { fieldTerms, textSpeaksOf } from './prematch.service';
import { lastQuestionIn } from './buttonsCarryTheQuestion';
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
/**
 * The recall line and its buttons are new words the owner reads: OFF until
 * Misho's yes on the exact text (NIGHT_QUESTIONS BR). Off, nothing is noted,
 * read or added.
 */
export const NEED_RECALL_ON = true;
const QUERY_TIMEOUT_MS = 5_000;
const NEEDS_READ = 50;

/** What one run saved, to be checked against the owner's saved needs at its end. */
const runSavedFacts = new Map<string, { readonly phone: string; readonly value: string }>();

/** A saved fact that can meet someone's need: anything but a need itself, and not empty. */
export function isNoteworthyFact(fieldType: string, value: string): boolean {
  return fieldType !== 'need' && value.trim() !== '';
}

export function noteSavedFact(
  runId: string | undefined,
  phone: string,
  fieldType: string,
  value: string,
): void {
  if (!NEED_RECALL_ON || runId === undefined || !isNoteworthyFact(fieldType, value)) return;
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
    `გახსოვს, ${geoName(r.needName, 'dat')} სჭირდება: „${r.need}“. ${r.helperName} შეიძლება დაეხმაროს — დავაკავშირო ისინი?`,
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

/** The pending-item kind of a recall delivered as its own message. */
export const NEED_RECALL_KIND = 'need_recall';

/**
 * T4890 (the founder, 13 Oct, thread 51037): the reply asked the owner its own
 * question („…ვის მირჩევ…?") and the recall was put under it with its two
 * buttons, so the message held two questions and the buttons answered the
 * recall, not the reply. A reply that already asks something, and does not
 * itself speak of the person in need, keeps its own question and its own
 * buttons; the recall goes out as its own message right after it.
 */
export function recallGoesApart(reply: string, recalled: RecalledNeed): boolean {
  return !reply.includes(recalled.needName) && lastQuestionIn(reply) !== null;
}

/** The recall as its own message: the same line and the same two buttons. */
export function recallCard(
  recalled: RecalledNeed,
  language: RunLanguage,
): { readonly text: string; readonly choices: string[] } {
  return { text: recallLine(language, recalled), choices: recallChoices(language) };
}
