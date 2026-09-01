import Anthropic from '@anthropic-ai/sdk';
import { recordClaudeUsage } from './costLedger.service';
import { query, backgroundQuery } from '../db/postgres/client';
import { normalizePhone } from './phone';
import { parseModelJson } from './modelJson';
import anthropic from '../config/anthropic';

// The four core, crowd-confirmable facts — one value per field per contact,
// mapped into search-result enrichment (employer/jobPosition/city/industry).
export const FACT_FIELD_TYPES = ['occupation', 'employer', 'city', 'industry'] as const;
export type FactFieldType = (typeof FACT_FIELD_TYPES)[number];

// A conventional free-text memory key. It is not special in the engine — ANY
// key that is not one of the four core facts behaves the same way: private to
// the submitter, never crowd-confirmed, and it ACCUMULATES (many rows per
// contact) instead of overwriting. This is what lets the prompt store a rich
// profile (role, skill, expertise, education, need, …) without the four fields
// having to know about each key.
export const MEMORY_FIELD_TYPE = 'note';
export const MAX_FIELD_TYPE_LEN = 40;
// A core fact is a short label (a job title, a company, a city). Anything
// longer is narrative — soft intel that must never sit in a public-capable,
// crowd-confirmable field (a real case: an "occupation" carrying a third
// party's co-founder conflict). Longer values are rerouted to a private note.
export const MAX_CORE_FACT_VALUE_LEN = 80;

/** True for the four crowd-confirmable, single-value, enrichment-mapped facts. */
export function isCoreFact(fieldType: string): boolean {
  return (FACT_FIELD_TYPES as readonly string[]).includes(fieldType);
}

/**
 * Normalize a caller-supplied field_type: trimmed, lowercased, whitespace
 * collapsed. Returns null when it is empty, too long, or has no letter — the
 * key is now free-form and model-controlled, so it must be bounded before it
 * touches the database.
 */
export function normalizeFieldType(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s || s.length > MAX_FIELD_TYPE_LEN) return null;
  if (!/\p{L}/u.test(s)) return null;
  return s;
}

interface FactRow {
  id: number;
  value: string;
}

export interface SemanticResult {
  canonical: string | null;
  matching_indices: number[];
}

export interface VisibleFact {
  field_type: string;
  value: string;
  is_public: boolean;
  // YYYY-MM-DD of the last save/confirmation — absent on crowd-filled values.
  last_confirmed?: string;
}

export interface VisibleFactsResult {
  facts: VisibleFact[];
  ask_about: string | null;
}

export async function runSemanticMatching(
  fieldType: string,
  values: string[],
): Promise<SemanticResult> {
  const listed = values.map((v, i) => `${i}: "${v}"`).join(', ');
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    messages: [
      {
        role: 'user',
        content: `Field: "${fieldType}". Values: ${listed}. Which indices describe the same thing? Find the largest matching group (min 2). Choose most specific/accurate as canonical. Reply JSON only: {"canonical":"best value","matching_indices":[...]} or {"canonical":null,"matching_indices":[]}`,
      },
    ],
  });

  void recordClaudeUsage({
    userId: null,
    kind: 'fact_extraction',
    model: 'claude-haiku-4-5-20251001',
    usage: response.usage,
  }).catch(() => {});

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  // An unparseable reply means "no match found" — the fail-closed default.
  return parseModelJson<SemanticResult>(text) ?? { canonical: null, matching_indices: [] };
}

async function upsertFact(
  userId: string,
  neo4jContactId: string,
  fieldType: string,
  value: string,
  source: FactSource,
  confidence: FactConfidence | null,
): Promise<void> {
  await query(
    // The arbiter is the partial unique index uq_contact_facts_structured, so
    // its predicate (only the four core facts) must be repeated here; free-form
    // keys have no such index and are never routed through this path.
    `INSERT INTO contact_facts (neo4j_contact_id, submitted_by_user_id, field_type, value, source, confidence)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (neo4j_contact_id, submitted_by_user_id, field_type)
       WHERE field_type IN ('occupation', 'employer', 'city', 'industry')
     DO UPDATE SET value = $4, is_public = false, canonical_value = null, updated_at = NOW(),
                   source = $5, confidence = $6`,
    [neo4jContactId, userId, fieldType, value, source, confidence],
  );
}

// Near-duplicate detection for accumulating facts (ticket 4 item 4B.6: one
// contact carried FIVE copies of the same sentence, saved on five days).
// Normalised-equal or ≥80% token overlap counts as the same statement — cheap,
// deterministic, no model call.
const DUPLICATE_TOKEN_OVERLAP = 0.8;

function normalizeFactText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:„““”"'()—–-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isNearDuplicateFact(a: string, b: string): boolean {
  const na = normalizeFactText(a);
  const nb = normalizeFactText(b);
  if (na === nb) return true;
  const ta = new Set(na.split(' ').filter(Boolean));
  const tb = new Set(nb.split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return false;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / Math.max(ta.size, tb.size) >= DUPLICATE_TOKEN_OVERLAP;
}

/**
 * Append a free-form fact. Non-core keys accumulate — but the SAME statement
 * saved again refreshes the existing row's date instead of piling up a copy:
 * a repeat is confirmation, not new information (4B.6).
 */
async function insertFreeFormFact(
  userId: string,
  neo4jContactId: string,
  fieldType: string,
  value: string,
  isPublic: boolean,
  source: FactSource,
  confidence: FactConfidence | null,
): Promise<void> {
  const existing = await query<{ id: number; value: string }>(
    `SELECT id, value FROM contact_facts
     WHERE neo4j_contact_id = $1 AND submitted_by_user_id = $2 AND field_type = $3
       AND retracted_at IS NULL`,
    [neo4jContactId, userId, fieldType],
  );
  const duplicate = existing.rows.find((row) => isNearDuplicateFact(row.value, value));
  if (duplicate) {
    await query(`UPDATE contact_facts SET updated_at = NOW() WHERE id = $1`, [duplicate.id]);
    return;
  }
  await query(
    // canonical_value doubles as the "shareable text" for public rows — the
    // read paths COALESCE it, so a public note must carry it. moderated_at
    // marks the row as already agent-checked (the nightly sweep skips it).
    `INSERT INTO contact_facts (neo4j_contact_id, submitted_by_user_id, field_type, value, is_public, canonical_value, moderated_at, source, confidence)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 THEN $4 END, NOW(), $6, $7)`,
    [neo4jContactId, userId, fieldType, value, isPublic, source, confidence],
  );
}

// The agent decides whether a free-text note may be seen by EVERYONE, at save
// time. PUBLIC is reserved for purely factual, professional content; personal
// judgments and sensitive material stay private. Fail-closed: any error or
// ambiguity keeps the note private.
const NOTE_MODERATION_MODEL = 'claude-haiku-4-5-20251001';
const NOTE_MODERATION_MAX_TOKENS = 60;

export async function moderateNotePublicity(fieldType: string, value: string): Promise<boolean> {
  try {
    const response = await anthropic.messages.create({
      model: NOTE_MODERATION_MODEL,
      max_tokens: NOTE_MODERATION_MAX_TOKENS,
      messages: [
        {
          role: 'user',
          content:
            `A user saved this about one of their contacts (field "${fieldType}"): "${value}". ` +
            'Decide if it may be shown to EVERY user of a contacts app. PUBLIC only if it is ' +
            'purely factual and professional: profession, workplace, role, skills, education, ' +
            'public achievements, business interests. PRIVATE if it contains personal judgments ' +
            'or evaluations, relationships, health, money, private life, secrets, contact ' +
            'details, or anything the person themselves might not want shared. When unsure — ' +
            'PRIVATE. Reply JSON only: {"public":true} or {"public":false}',
        },
      ],
    });
    void recordClaudeUsage({
      userId: null,
      kind: 'fact_moderation',
      model: NOTE_MODERATION_MODEL,
      usage: response.usage,
    }).catch(() => {});
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const parsed = parseModelJson<{ public?: unknown }>(text);
    return parsed?.public === true;
  } catch {
    return false;
  }
}

async function getOtherFacts(
  userId: string,
  neo4jContactId: string,
  fieldType: string,
): Promise<FactRow[]> {
  const result = await query<FactRow>(
    `SELECT id, value FROM contact_facts
     WHERE neo4j_contact_id = $1 AND field_type = $2 AND submitted_by_user_id != $3
       AND retracted_at IS NULL`,
    [neo4jContactId, fieldType, userId],
  );
  return result.rows;
}

// Where a fact came from, and how sure that source was — ticket 6 engine
// T1's provenance requirement, shared with T2's label parser. 'chat' is the
// default: the overwhelming majority of calls are the live assistant saving
// something the user just said.
export type FactSource = 'chat' | 'sweep' | 'label' | 'debrief';
export type FactConfidence = 'stated' | 'mentioned';

// The founder's ruling (1 Sep, via Misho): the two-source rule stays for
// everyone, with ONE exception — the accounts listed here are trusted
// curators seeding the network, and a core fact they record is public the
// moment they write it, with no second source needed. Config, not code: the
// list is an env var so the founder can add or drop a curator without a
// deploy, and an empty list (the default) means "no exceptions at all".
let curatorCache: { raw: string; ids: readonly string[] } | null = null;

/** The configured curator ids, re-read whenever the variable itself changes. */
export function trustedFactCuratorIds(): readonly string[] {
  const raw = process.env.TRUSTED_FACT_CURATOR_USER_IDS ?? '';
  if (curatorCache === null || curatorCache.raw !== raw) {
    curatorCache = {
      raw,
      ids: raw
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    };
  }
  return curatorCache.ids;
}

export function isTrustedFactCurator(userId: string): boolean {
  return trustedFactCuratorIds().includes(userId.trim());
}

/** A curator's core fact is published as written — their value IS the canonical. */
async function publishAsCurator(
  userId: string,
  neo4jContactId: string,
  fieldType: string,
  value: string,
): Promise<void> {
  await query(
    `UPDATE contact_facts SET is_public = true, canonical_value = $1, updated_at = NOW()
     WHERE neo4j_contact_id = $2 AND submitted_by_user_id = $3 AND field_type = $4
       AND retracted_at IS NULL`,
    [value, neo4jContactId, userId, fieldType],
  );
}

export async function submitContactFact(
  userId: string,
  neo4jContactIdRaw: string,
  fieldTypeRaw: string,
  value: string,
  source: FactSource = 'chat',
  confidence: FactConfidence | null = 'stated',
): Promise<{ is_public: boolean; canonical_value: string | null }> {
  const neo4jContactId = normalizePhone(neo4jContactIdRaw);
  const fieldType = (fieldTypeRaw.trim().toLowerCase() || 'note').slice(0, MAX_FIELD_TYPE_LEN);

  // Any non-core key (note, role, skill, …) accumulates. Whether it is shared
  // with other users is the AGENT's call at save time: purely professional
  // facts go public, anything personal or ambiguous stays private (fail-closed).
  // A narrative-length value aimed at a core field is rerouted the same way:
  // it is soft intel, not a label, and never enters crowd canonicalization.
  if (!isCoreFact(fieldType) || value.trim().length > MAX_CORE_FACT_VALUE_LEN) {
    const targetField =
      isCoreFact(fieldType) && value.trim().length > MAX_CORE_FACT_VALUE_LEN
        ? MEMORY_FIELD_TYPE
        : fieldType;
    const isPublic = await moderateNotePublicity(targetField, value);
    await insertFreeFormFact(
      userId,
      neo4jContactId,
      targetField,
      value,
      isPublic,
      source,
      confidence,
    );
    return { is_public: isPublic, canonical_value: null };
  }

  await upsertFact(userId, neo4jContactId, fieldType, value, source, confidence);

  // A trusted curator needs no second source (the founder's ruling, 1 Sep).
  // Everyone else's rows are untouched: they keep confirming each other by the
  // normal rule, and a later matching save publishes them through the path
  // below — which now counts the curator's value among the candidates.
  if (isTrustedFactCurator(userId)) {
    await publishAsCurator(userId, neo4jContactId, fieldType, value);
    return { is_public: true, canonical_value: value };
  }

  const others = await getOtherFacts(userId, neo4jContactId, fieldType);
  if (others.length === 0) return { is_public: false, canonical_value: null };

  const allValues = [value, ...others.map((r) => r.value)];
  let matchResult: SemanticResult;
  try {
    matchResult = await runSemanticMatching(fieldType, allValues);
  } catch {
    return { is_public: false, canonical_value: null };
  }

  if (!matchResult.canonical || matchResult.matching_indices.length < 2) {
    return { is_public: false, canonical_value: null };
  }

  const currentMatches = matchResult.matching_indices.includes(0);
  const matchingOtherIds = matchResult.matching_indices
    .filter((i) => i > 0)
    .map((i) => others[i - 1].id);

  if (matchingOtherIds.length === 0) return { is_public: false, canonical_value: null };

  await query(
    `UPDATE contact_facts SET is_public = true, canonical_value = $1, updated_at = NOW()
     WHERE id = ANY($2)`,
    [matchResult.canonical, matchingOtherIds],
  );

  if (currentMatches) {
    await query(
      `UPDATE contact_facts SET is_public = true, canonical_value = $1, updated_at = NOW()
       WHERE neo4j_contact_id = $2 AND submitted_by_user_id = $3 AND field_type = $4`,
      [matchResult.canonical, neo4jContactId, userId, fieldType],
    );
    return { is_public: true, canonical_value: matchResult.canonical };
  }

  return { is_public: false, canonical_value: null };
}

export async function getVisibleFacts(
  userId: string,
  neo4jContactIdRaw: string,
): Promise<VisibleFactsResult> {
  const neo4jContactId = normalizePhone(neo4jContactIdRaw);
  const [ownResult, publicResult] = await Promise.all([
    // The owner's OWN saved values — ALL of them (free-form keys accumulate), and
    // always shown, even when the crowd's public value for the same field differs.
    query<{ field_type: string; value: string; is_public: boolean; last_confirmed: string }>(
      `SELECT field_type, COALESCE(canonical_value, value) AS value, is_public,
              TO_CHAR(updated_at, 'YYYY-MM-DD') AS last_confirmed
       FROM contact_facts
       WHERE neo4j_contact_id = $1 AND submitted_by_user_id = $2 AND retracted_at IS NULL
       ORDER BY field_type, updated_at DESC`,
      [neo4jContactId, userId],
    ),
    // Public values from any submitter: crowd-confirmed core facts (fill-only)
    // and agent-approved public notes (appended, they accumulate).
    query<{ field_type: string; canonical_value: string }>(
      `SELECT field_type, COALESCE(canonical_value, value) AS canonical_value
       FROM contact_facts
       WHERE neo4j_contact_id = $1 AND is_public = true AND retracted_at IS NULL
       ORDER BY field_type, updated_at DESC`,
      [neo4jContactId],
    ),
  ]);

  const ownFieldTypes = new Set(ownResult.rows.map((r) => r.field_type));
  // last_confirmed lets the model time-check a role/employer before ranking on
  // it — tags carry no date, so a 16-years-stale "head of department" read as
  // current. A date makes stale roles visible instead of trusted.
  const facts: VisibleFact[] = ownResult.rows.map((r) => ({
    field_type: r.field_type,
    value: r.value,
    is_public: r.is_public,
    last_confirmed: r.last_confirmed,
  }));

  // Core facts: fill only when the owner never set the field (their value
  // always wins). Free-form public notes: append every one the owner does not
  // already hold verbatim — they accumulate rather than collapse.
  const seenValues = new Set(ownResult.rows.map((r) => `${r.field_type} ${r.value}`));
  const filledCore = new Set<string>();
  for (const row of publicResult.rows) {
    if (isCoreFact(row.field_type)) {
      if (!ownFieldTypes.has(row.field_type) && !filledCore.has(row.field_type)) {
        facts.push({ field_type: row.field_type, value: row.canonical_value, is_public: true });
        filledCore.add(row.field_type);
      }
    } else {
      const key = `${row.field_type} ${row.canonical_value}`;
      if (!seenValues.has(key)) {
        facts.push({ field_type: row.field_type, value: row.canonical_value, is_public: true });
        seenValues.add(key);
      }
    }
  }

  const knownFields = new Set([...ownFieldTypes, ...publicResult.rows.map((r) => r.field_type)]);
  const ask_about = FACT_FIELD_TYPES.find((f) => !knownFields.has(f)) ?? null;

  return { facts, ask_about };
}

// Backfill: run existing PRIVATE free-form notes through the same agent
// moderation that new saves get, publishing the clearly-professional ones.
// Background pool + pacing on purpose — this loops model calls and must never
// contend with live traffic. Capped per invocation; call again to continue.
const RECLASSIFY_DEFAULT_CAP = 150;
const RECLASSIFY_DELAY_MS = 150;

export interface ReclassifyResult {
  scanned: number;
  published: number;
  remaining: number;
}

export async function reclassifyPrivateNotes(
  userId: string | null,
  cap: number = RECLASSIFY_DEFAULT_CAP,
): Promise<ReclassifyResult> {
  // moderated_at IS NULL = never agent-checked. Every scanned row gets stamped
  // (public or not), so the sweep converges instead of re-judging the same
  // private notes forever.
  const rows = await backgroundQuery<{ id: number; field_type: string; value: string }>(
    `SELECT id, field_type, value FROM contact_facts
     WHERE ($1::text IS NULL OR submitted_by_user_id = $1::text)
       AND is_public = false AND moderated_at IS NULL AND retracted_at IS NULL
       AND field_type NOT IN ('occupation', 'employer', 'city', 'industry')
     ORDER BY id
     LIMIT $2`,
    [userId, cap + 1],
  );
  const batch = rows.rows.slice(0, cap);
  let published = 0;
  for (const row of batch) {
    const isPublic = await moderateNotePublicity(row.field_type, row.value);
    await backgroundQuery(
      `UPDATE contact_facts
       SET moderated_at = NOW(),
           is_public = $2,
           canonical_value = CASE WHEN $2 THEN value ELSE canonical_value END,
           updated_at = CASE WHEN $2 THEN NOW() ELSE updated_at END
       WHERE id = $1`,
      [row.id, isPublic],
    );
    if (isPublic) published++;
    await new Promise<void>((resolve) => setTimeout(resolve, RECLASSIFY_DELAY_MS));
  }
  return {
    scanned: batch.length,
    published,
    remaining: rows.rows.length > cap ? 1 : 0,
  };
}

/**
 * The user says a saved fact is WRONG: their own matching rows are marked
 * retracted (kept for audit) and leave every read path — search overlays,
 * profiles, crowd confirmation, the moderation sweep. Scoped to the caller's
 * own submissions; others' rows are untouched (the caller's own corrected
 * value already outranks public values in every read).
 */
export async function retractOwnFacts(
  userId: string,
  neo4jContactIdRaw: string,
  fieldType?: string,
  valueFragment?: string,
): Promise<{ retracted: number }> {
  const neo4jContactId = normalizePhone(neo4jContactIdRaw);
  const result = await query(
    `UPDATE contact_facts
     SET retracted_at = NOW(), is_public = false, updated_at = NOW()
     WHERE neo4j_contact_id = $1 AND submitted_by_user_id = $2
       AND retracted_at IS NULL
       AND ($3::text IS NULL OR field_type = $3)
       AND ($4::text IS NULL OR value ILIKE '%' || $4 || '%')`,
    [
      neo4jContactId,
      userId,
      fieldType?.trim().toLowerCase() || null,
      valueFragment?.trim() || null,
    ],
  );
  return { retracted: result.rowCount ?? 0 };
}

/**
 * Engine T14 (memory mirror), part (b) — "instant hard delete of any fact
 * ('forget this') with confirmation... deleted facts are gone from all
 * layers immediately and stay gone." Deliberately a different action from
 * retractOwnFacts above: retraction is for "this fact is WRONG" (the row
 * survives, kept for audit, excluded from reads by retracted_at) — this is
 * for "I want this gone," a genuine DELETE. contact_facts is the only
 * layer a fact lives in (Neo4j never stores facts, only graph edges;
 * UserTags is a separate, distinct label store) — no cross-layer cleanup
 * is needed for this specific kind of data. Scoped to the caller's own
 * submissions, same as retraction.
 */
export async function hardDeleteOwnFact(
  userId: string,
  neo4jContactIdRaw: string,
  fieldType?: string,
  valueFragment?: string,
): Promise<{ deleted: number }> {
  const neo4jContactId = normalizePhone(neo4jContactIdRaw);
  const result = await query(
    `DELETE FROM contact_facts
     WHERE neo4j_contact_id = $1 AND submitted_by_user_id = $2
       AND ($3::text IS NULL OR field_type = $3)
       AND ($4::text IS NULL OR value ILIKE '%' || $4 || '%')`,
    [
      neo4jContactId,
      userId,
      fieldType?.trim().toLowerCase() || null,
      valueFragment?.trim() || null,
    ],
  );
  return { deleted: result.rowCount ?? 0 };
}

/**
 * Ticket 6 P0 (25 Aug): a foreign contact sync (someone logging into this
 * account on their own phone, years ago) left that person's phonebook
 * attached to this account's UserAlias rows. The label parser (T2) later
 * read those rows and wrote real contact_facts, filed as THIS account's own
 * submissions — authorship it never had. Scoped narrowly: only source =
 * 'label' facts (the parser's own output, not manually researched or
 * chat-entered facts that happen to share a phone with the contamination),
 * and only where the exact (phone, alias) pair is independently verified —
 * it exists byte-for-byte under the sync source's OWN UserAlias rows too,
 * not merely "some contact this account also has." General on purpose (any
 * contaminatedUserId / syncSourceUserId pair), since Task 4 of this same
 * round asks whether other accounts carry the same kind of sync.
 */
export async function retractFactsFromForeignSync(
  contaminatedUserId: string,
  syncSourceUserId: string,
): Promise<{ retracted: number }> {
  const result = await query(
    `UPDATE contact_facts cf
     SET retracted_at = NOW(), is_public = false, updated_at = NOW()
     WHERE cf.submitted_by_user_id = $1
       AND cf.retracted_at IS NULL
       AND cf.source = 'label'
       AND EXISTS (
         SELECT 1 FROM "UserAlias" a
         WHERE a."contactId" = $1::int AND a.phone = cf.neo4j_contact_id
           AND EXISTS (
             SELECT 1 FROM "UserAlias" b
             WHERE b."contactId" = $2::int AND b.phone = a.phone AND b.alias = a.alias
           )
       )`,
    [contaminatedUserId, syncSourceUserId],
  );
  return { retracted: result.rowCount ?? 0 };
}
