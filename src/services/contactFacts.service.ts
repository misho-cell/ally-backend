import Anthropic from '@anthropic-ai/sdk';
import { recordClaudeUsage } from './costLedger.service';
import { query } from '../db/postgres/client';
import { normalizePhone } from './phone';
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

interface SemanticResult {
  canonical: string | null;
  matching_indices: number[];
}

export interface VisibleFact {
  field_type: string;
  value: string;
  is_public: boolean;
}

export interface VisibleFactsResult {
  facts: VisibleFact[];
  ask_about: string | null;
}

async function runSemanticMatching(fieldType: string, values: string[]): Promise<SemanticResult> {
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

  try {
    return JSON.parse(text) as SemanticResult;
  } catch {
    return { canonical: null, matching_indices: [] };
  }
}

async function upsertFact(
  userId: string,
  neo4jContactId: string,
  fieldType: string,
  value: string,
): Promise<void> {
  await query(
    // The arbiter is the partial unique index uq_contact_facts_structured, so
    // its predicate (only the four core facts) must be repeated here; free-form
    // keys have no such index and are never routed through this path.
    `INSERT INTO contact_facts (neo4j_contact_id, submitted_by_user_id, field_type, value)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (neo4j_contact_id, submitted_by_user_id, field_type)
       WHERE field_type IN ('occupation', 'employer', 'city', 'industry')
     DO UPDATE SET value = $4, is_public = false, canonical_value = null, updated_at = NOW()`,
    [neo4jContactId, userId, fieldType, value],
  );
}

/** Append a free-form fact. Non-core keys accumulate — each save is a new private row. */
async function insertFreeFormFact(
  userId: string,
  neo4jContactId: string,
  fieldType: string,
  value: string,
): Promise<void> {
  await query(
    `INSERT INTO contact_facts (neo4j_contact_id, submitted_by_user_id, field_type, value)
     VALUES ($1, $2, $3, $4)`,
    [neo4jContactId, userId, fieldType, value],
  );
}

async function getOtherFacts(
  userId: string,
  neo4jContactId: string,
  fieldType: string,
): Promise<FactRow[]> {
  const result = await query<FactRow>(
    `SELECT id, value FROM contact_facts
     WHERE neo4j_contact_id = $1 AND field_type = $2 AND submitted_by_user_id != $3`,
    [neo4jContactId, fieldType, userId],
  );
  return result.rows;
}

export async function submitContactFact(
  userId: string,
  neo4jContactIdRaw: string,
  fieldTypeRaw: string,
  value: string,
): Promise<{ is_public: boolean; canonical_value: string | null }> {
  const neo4jContactId = normalizePhone(neo4jContactIdRaw);
  const fieldType = (fieldTypeRaw.trim().toLowerCase() || 'note').slice(0, MAX_FIELD_TYPE_LEN);

  // Any non-core key (note, role, skill, …) is private and accumulates — no
  // crowd-confirmation pass. Only the four core facts go through canonicalization.
  if (!isCoreFact(fieldType)) {
    await insertFreeFormFact(userId, neo4jContactId, fieldType, value);
    return { is_public: false, canonical_value: null };
  }

  await upsertFact(userId, neo4jContactId, fieldType, value);

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
  const [publicResult, privateResult] = await Promise.all([
    query<{ field_type: string; canonical_value: string }>(
      `SELECT DISTINCT ON (field_type) field_type, canonical_value
       FROM contact_facts
       WHERE neo4j_contact_id = $1 AND is_public = true
       ORDER BY field_type`,
      [neo4jContactId],
    ),
    query<{ field_type: string; value: string }>(
      `SELECT field_type, value FROM contact_facts
       WHERE neo4j_contact_id = $1 AND submitted_by_user_id = $2 AND is_public = false`,
      [neo4jContactId, userId],
    ),
  ]);

  const publicFieldTypes = new Set(publicResult.rows.map((r) => r.field_type));
  const facts: VisibleFact[] = publicResult.rows.map((r) => ({
    field_type: r.field_type,
    value: r.canonical_value,
    is_public: true,
  }));

  for (const row of privateResult.rows) {
    if (!publicFieldTypes.has(row.field_type)) {
      facts.push({ field_type: row.field_type, value: row.value, is_public: false });
    }
  }

  const knownFields = new Set([
    ...publicResult.rows.map((r) => r.field_type),
    ...privateResult.rows.map((r) => r.field_type),
  ]);
  const ask_about = FACT_FIELD_TYPES.find((f) => !knownFields.has(f)) ?? null;

  return { facts, ask_about };
}
