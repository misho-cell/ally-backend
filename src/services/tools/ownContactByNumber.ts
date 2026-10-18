import { query } from '../../db/postgres/client';
import { phoneDigits } from '../phone';
import { buildRawWordGroups } from './transliterate';
import { askedWordKeys, LabelKind, NetworkLabel, networkNamesFor } from './networkNames';

/**
 * 5908 (founder P1, threads 59536/59537/59538): the owner asked about
 * „Gogita Fiktadze", the name search found the right number — the owner's own
 * contact, saved by him as „Bubu" — and the run said „no confirmed
 * information" or rejected it as „registered as another name". The row read
 * `name: "Bubu"` with `found_by_others_labels: true` and a description saying
 * other people's words are private, so nothing told the run that the match is
 * the NUMBER, and that the number is his.
 *
 * A row like that now says it in structure and in words: in your contacts,
 * saved by you as „Bubu", known to other members as „Gogita Fiktadze" (only
 * names — see networkNames), matched through the number.
 */

const LABELS_TIMEOUT_MS = 5_000;
const MAX_LABEL_ROWS = 400;
const ROW_FLAG_OTHERS_ONLY = 'found_by_others_labels';
const MATCHED_THROUGH_NUMBER = 'number';

export interface OwnContact {
  readonly in_your_contacts: true;
  readonly you_saved_as?: string;
  readonly others_know_as?: readonly string[];
  readonly matched_through: typeof MATCHED_THROUGH_NUMBER;
}

export interface OwnContactView {
  readonly own_contact: OwnContact;
  readonly own_contact_note: string;
}

interface LabelRow {
  readonly phone: string;
  readonly saver_id: string;
  readonly label: string;
  readonly kind: LabelKind;
}

interface OwnLabelRow {
  readonly own_label: string | null;
  readonly is_own: boolean;
}

const quoted = (text: string): string => `„${text}"`;

/**
 * MODEL-FACING (D44, ships on Misho's own word): what the run is told about an
 * own contact matched through other members' names on the number.
 */
export function ownContactNote(ownLabel: string | null, othersKnowAs: readonly string[]): string {
  const savedAs = ownLabel === null ? '' : `, saved by the owner as ${quoted(ownLabel)}`;
  const known =
    othersKnowAs.length > 0
      ? ` Other members have the same number saved as ${othersKnowAs.map(quoted).join(', ')}.`
      : ' Other members have the same number saved under the name asked.';
  const say =
    ownLabel === null
      ? ' Say plainly that this person is in their contacts'
      : ` Say plainly „you have him/her saved as ${ownLabel}"`;
  return (
    `This number is in the owner's own contacts${savedAs}.${known}` +
    ' The match is through the number, not a guess at a similar name: it is the same person.' +
    `${say}, then tell what is known about them. Never reject it as a different name, ` +
    'an approximate match or unconfirmed. Never say who saved which name.'
  );
}

export function ownContactView(
  ownLabel: string | null,
  othersKnowAs: readonly string[],
): OwnContactView {
  return {
    own_contact: {
      in_your_contacts: true,
      ...(ownLabel !== null && { you_saved_as: ownLabel }),
      ...(othersKnowAs.length > 0 && { others_know_as: othersKnowAs }),
      matched_through: MATCHED_THROUGH_NUMBER,
    },
    own_contact_note: ownContactNote(ownLabel, othersKnowAs),
  };
}

/** The names and labels other members saved on these numbers — never the owner's. */
export async function fetchOthersLabels(
  userId: string,
  phones: readonly string[],
): Promise<Map<string, NetworkLabel[]>> {
  const byPhone = new Map<string, NetworkLabel[]>();
  if (phones.length === 0) return byPhone;
  const result = await query<LabelRow>(
    `SELECT phone, saver_id, label, kind FROM (
       SELECT ua.phone, ua."contactId"::text AS saver_id, TRIM(ua.alias) AS label, 'alias' AS kind
         FROM "UserAlias" ua WHERE ua.phone = ANY($1::text[])
       UNION
       SELECT ut.phone, ut."contactId"::text AS saver_id, TRIM(ut.tag) AS label, 'tag' AS kind
         FROM "UserTags" ut WHERE ut.phone = ANY($1::text[])
     ) l
     WHERE saver_id IS NOT NULL AND saver_id <> $2::text AND NULLIF(label, '') IS NOT NULL
     ORDER BY kind, label
     LIMIT $3`,
    [[...phones], userId, MAX_LABEL_ROWS],
    LABELS_TIMEOUT_MS,
  );
  for (const row of result.rows) {
    if (typeof row.label !== 'string' || typeof row.saver_id !== 'string') continue;
    const list = byPhone.get(row.phone) ?? [];
    list.push({ saverId: row.saver_id, label: row.label, kind: row.kind });
    byPhone.set(row.phone, list);
  }
  return byPhone;
}

function isOthersOnlyExactMatch(row: Readonly<Record<string, unknown>>): boolean {
  return row[ROW_FLAG_OTHERS_ONLY] === true && row.approximate !== true;
}

function ownLabelOf(row: Readonly<Record<string, unknown>>): string | null {
  const saved = typeof row.saved_as === 'string' ? row.saved_as.trim() : '';
  return saved === '' ? null : saved;
}

/**
 * Name-search rows found only through other members' labels, and matched on
 * every word asked, carry the own-contact view. Best-effort: a failed read
 * leaves the rows as they were and says so in the log.
 */
export async function withOwnContactByNumber(
  userId: string,
  rows: ReadonlyArray<Record<string, unknown>>,
  groups: readonly (readonly string[])[],
): Promise<Array<Record<string, unknown>>> {
  const candidates = rows.filter(isOthersOnlyExactMatch);
  if (candidates.length === 0) return [...rows];
  try {
    const labels = await fetchOthersLabels(
      userId,
      candidates.map((row) => String(row.phone)),
    );
    const asked = askedWordKeys(groups);
    return rows.map((row) => {
      if (!isOthersOnlyExactMatch(row)) return row;
      const ownLabel = ownLabelOf(row);
      const names = networkNamesFor(labels.get(String(row.phone)) ?? [], ownLabel, asked);
      return { ...row, ...ownContactView(ownLabel, names) };
    });
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error('[own-contact] others’ labels unavailable:', (err as Error).message);
    return [...rows];
  }
}

async function ownLabelFor(userId: string, phone: string): Promise<OwnLabelRow> {
  const result = await query<OwnLabelRow>(
    `SELECT
       (SELECT NULLIF(TRIM(ua.alias), '') FROM "UserAlias" ua
         WHERE ua.phone = $1 AND ua."contactId" = $2 AND NULLIF(TRIM(ua.alias), '') IS NOT NULL
         ORDER BY ua.id DESC LIMIT 1) AS own_label,
       (EXISTS (SELECT 1 FROM "UserAlias" WHERE phone = $1 AND "contactId" = $2)
        OR EXISTS (SELECT 1 FROM "UserTags" WHERE phone = $1 AND "contactId" = $2)) AS is_own`,
    [phone, userId],
    LABELS_TIMEOUT_MS,
  );
  return result.rows[0] ?? { own_label: null, is_own: false };
}

/**
 * The contact card's half (5908 point 3): for a number in the owner's own
 * contacts, the names other members know it by — the ones the owner asked by
 * in this run, and the ones the network agrees on. Empty when the number is
 * not the owner's, when no name may be said, or when the read fails.
 */
export async function ownContactOnTheCard(
  userId: string,
  phone: string,
  askedName: string | undefined,
): Promise<Partial<OwnContactView>> {
  try {
    const [own, labels] = await Promise.all([
      ownLabelFor(userId, phone),
      fetchOthersLabels(userId, [phone]),
    ]);
    if (!own.is_own) return {};
    const asked = askedWordKeys(askedName === undefined ? [] : buildRawWordGroups(askedName));
    const names = networkNamesFor(labels.get(phone) ?? [], own.own_label, asked);
    return names.length === 0 ? {} : ownContactView(own.own_label, names);
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error('[own-contact] card view unavailable:', (err as Error).message);
    return {};
  }
}

/** Per run: the name the owner asked by, for each number the name search returned. */
const namesAskedByRun = new Map<string, Map<string, string>>();

function phonesIn(found: unknown): string[] {
  if (found === null || typeof found !== 'object') return [];
  const results = (found as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  return results
    .map((row: unknown) =>
      row !== null && typeof row === 'object' ? (row as { phone?: unknown }).phone : undefined,
    )
    .filter((phone): phone is string => typeof phone === 'string' && phone !== '');
}

export function rememberNameAsked(
  runId: string | undefined,
  found: unknown,
  nameQuery: unknown,
): void {
  if (runId === undefined || typeof nameQuery !== 'string') return;
  const phones = phonesIn(found);
  if (phones.length === 0) return;
  const held = namesAskedByRun.get(runId) ?? new Map<string, string>();
  for (const phone of phones) held.set(phoneDigits(phone), nameQuery);
  namesAskedByRun.set(runId, held);
}

export function nameAskedFor(runId: string | undefined, phone: unknown): string | undefined {
  if (runId === undefined || typeof phone !== 'string') return undefined;
  return namesAskedByRun.get(runId)?.get(phoneDigits(phone));
}

export function forgetNamesAsked(runId: string): void {
  namesAskedByRun.delete(runId);
}
