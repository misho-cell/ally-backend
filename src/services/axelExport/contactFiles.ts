import type { CsvValue } from './csv';
import { exportPhoneHash } from './exportHash';
import { labelParts, namesSeniorRole } from './labelParts';
import type { OwnerContactValue, PhonebookRow } from './axelData';
import type { AskRow, EnrichmentRow, FactRow } from './axelDataB';
import { byOwner, isWarm, type MemberInputs, type OwnerIndex } from './memberFiles';

/**
 * Parts B and C of the Axel export: one row per phonebook entry, one row per
 * fact, and the crossings between members. Pure — the reads are elsewhere.
 */
export interface ContactInputs {
  readonly facts: readonly FactRow[];
  readonly insights: readonly OwnerContactValue[];
  readonly exclusions: readonly OwnerContactValue[];
  readonly blocks: readonly OwnerContactValue[];
  readonly warmth: readonly OwnerContactValue[];
  readonly intros: readonly OwnerContactValue[];
  readonly invites: readonly OwnerContactValue[];
  readonly ties: readonly OwnerContactValue[];
  readonly asks: readonly AskRow[];
  readonly enrichment: ReadonlyMap<string, EnrichmentRow>;
}

/** The base's own via_warmth (searchSecondDegree.ts): floor 0.3, signals add, capped at 0.95. */
const WARMTH_FLOOR = 0.3;
const WARMTH_CAP = 0.95;
const PER_TAG = 0.05;
const MAX_TAGS_COUNTED = 4;
const OWN_FACT_BONUS = 0.1;
const ANSWERED_ASK_BONUS = 0.2;
const TIE_BONUS = 0.2;

export function viaWarmth(input: {
  readonly score: number | null;
  readonly tags: number;
  readonly ownFact: boolean;
  readonly answeredAsk: boolean;
  readonly tie: boolean;
}): number {
  const signals =
    WARMTH_FLOOR +
    PER_TAG * Math.min(input.tags, MAX_TAGS_COUNTED) +
    (input.ownFact ? OWN_FACT_BONUS : 0) +
    (input.answeredAsk ? ANSWERED_ASK_BONUS : 0);
  const base = Math.min(WARMTH_CAP, Math.max(input.score ?? WARMTH_FLOOR, signals));
  return Math.round(Math.min(WARMTH_CAP, input.tie ? base + TIE_BONUS : base) * 100) / 100;
}

export interface ContactIndex {
  readonly factsByDigits: Map<string, FactRow[]>;
  readonly insights: Map<number, Map<string, string[]>>;
  readonly exclusions: Map<number, Map<string, string[]>>;
  readonly blocks: Map<number, Map<string, string[]>>;
  readonly warmth: Map<number, Map<string, string[]>>;
  readonly intros: Map<number, Map<string, string[]>>;
  readonly invites: Map<number, Map<string, string[]>>;
  readonly ties: Map<number, Map<string, string[]>>;
  readonly asksByOwnerTo: Map<string, AskRow[]>;
}

export function contactIndex(c: ContactInputs): ContactIndex {
  const factsByDigits = new Map<string, FactRow[]>();
  for (const f of c.facts)
    factsByDigits.set(f.contact_digits, [...(factsByDigits.get(f.contact_digits) ?? []), f]);
  const asksByOwnerTo = new Map<string, AskRow[]>();
  for (const a of c.asks) {
    const key = `${a.owner_id}|${a.to_user_id}`;
    asksByOwnerTo.set(key, [...(asksByOwnerTo.get(key) ?? []), a]);
  }
  return {
    factsByDigits,
    insights: byOwner(c.insights),
    exclusions: byOwner(c.exclusions),
    blocks: byOwner(c.blocks),
    warmth: byOwner(c.warmth),
    intros: byOwner(c.intros),
    invites: byOwner(c.invites),
    ties: byOwner(c.ties),
    asksByOwnerTo,
  };
}

const first = (m: Map<number, Map<string, string[]>>, owner: number, d: string): string[] =>
  m.get(owner)?.get(d) ?? [];

function factField(facts: readonly FactRow[], field: string): string {
  return [...new Set(facts.filter((f) => f.field_type === field).map((f) => f.value))].join('; ');
}

function askSummary(asks: readonly AskRow[]): Record<string, CsvValue> {
  return {
    asks_sent: asks.length,
    asks_answered: asks.filter((a) => a.status === 'answered' && !a.declined).length,
    asks_declined: asks.filter((a) => a.declined).length,
    asks_later: asks.filter((a) => a.later && a.status === 'sent').length,
    asks_open: asks.filter((a) => a.status === 'sent').length,
  };
}

export interface RowContext {
  readonly members: MemberInputs;
  readonly idx: OwnerIndex;
  readonly cidx: ContactIndex;
  readonly enrichment: ReadonlyMap<string, EnrichmentRow>;
  readonly rosterKeyByDigits: ReadonlyMap<string, number>;
  readonly rosterKeyByUserId: ReadonlyMap<number, number>;
}

function relationshipFields(owner: number, d: string, ctx: RowContext): Record<string, CsvValue> {
  const scores = first(ctx.idx.scores, owner, d).map((v) => v.split('|'));
  const tags = first(ctx.idx.tags, owner, d);
  const facts = ctx.cidx.factsByDigits.get(d) ?? [];
  const contact = ctx.members.accountsByDigits.get(d);
  const asks = contact ? (ctx.cidx.asksByOwnerTo.get(`${owner}|${contact.user_id}`) ?? []) : [];
  const ties = first(ctx.cidx.ties, owner, d);
  const strength = scores[0]?.[1] ? Number(scores[0][1]) : null;
  return {
    relationship: scores.map((s) => s[0]).join('; '),
    relationship_strength: strength ?? '',
    via_warmth: viaWarmth({
      score: strength,
      tags: tags.length,
      ownFact: facts.some((f) => f.submitted_by === String(owner)),
      answeredAsk: asks.some((a) => a.status === 'answered' && !a.declined),
      tie: ties.length > 0,
    }),
    warm: isWarm(owner, d, ctx.idx),
    close_contact: first(ctx.cidx.warmth, owner, d).includes('stated_close'),
    tier: first(ctx.idx.tiers, owner, d).join('; '),
    legacy_colour: first(ctx.idx.legacy, owner, d).join('; '),
    excluded: first(ctx.cidx.exclusions, owner, d).join('; '),
    blocked: first(ctx.cidx.blocks, owner, d).length > 0,
    ties_written: ties
      .map((t) => {
        const [relation, other] = t.split('|');
        return `${relation}:${exportPhoneHash(other)}`;
      })
      .join('; '),
  };
}

export function contactRow(row: PhonebookRow, ctx: RowContext): Record<string, CsvValue> {
  const owner = row.owner_id;
  const d = row.contact_digits;
  const parts = labelParts(row.label);
  const tags = first(ctx.idx.tags, owner, d).map((v) => v.split('|'));
  const facts = ctx.cidx.factsByDigits.get(d) ?? [];
  const contact = ctx.members.accountsByDigits.get(d);
  const asks = contact ? (ctx.cidx.asksByOwnerTo.get(`${owner}|${contact.user_id}`) ?? []) : [];
  const enrich = ctx.enrichment.get(d);
  const factText = facts.map((f) => f.value).join(' ');
  return {
    owner_roster_key: ctx.rosterKeyByUserId.get(owner) ?? '',
    owner_user_id: owner,
    contact_hash: exportPhoneHash(d),
    contact_user_id: contact?.user_id ?? '',
    contact_account_state:
      contact === undefined ? 'none' : contact.netai_user ? 'netai_user' : 'ally_account',
    contact_roster_key: ctx.rosterKeyByDigits.get(d) ?? '',
    label: row.label ?? '',
    label_script: parts.script,
    label_first_name: parts.first_name,
    label_surname: parts.surname,
    label_company: parts.company,
    label_role: parts.role,
    label_saved_at: row.saved_at ? new Date(row.saved_at).toISOString() : '',
    label_source: row.source ?? '',
    tags: tags.map((t) => t[0]).join('; '),
    tag_sources: [...new Set(tags.map((t) => t[1]).filter(Boolean))].join('; '),
    fact_count: facts.length,
    employer: factField(facts, 'employer'),
    occupation: factField(facts, 'occupation'),
    city: factField(facts, 'city'),
    industry: factField(facts, 'industry') || (enrich?.industry ?? ''),
    seniority: enrich?.seniority ?? '',
    is_decision_maker: enrich?.is_decision_maker ?? '',
    owner_insights: first(ctx.cidx.insights, owner, d).join(' '),
    ...relationshipFields(owner, d, ctx),
    ...askSummary(asks),
    introductions_asked: first(ctx.cidx.intros, owner, d).join('; '),
    invited: first(ctx.cidx.invites, owner, d).length > 0,
    senior_role: namesSeniorRole(`${row.label ?? ''} ${factText}`),
  };
}

export const CONTACT_COLUMNS = [
  'owner_roster_key',
  'owner_user_id',
  'contact_hash',
  'contact_user_id',
  'contact_account_state',
  'contact_roster_key',
  'label',
  'label_script',
  'label_first_name',
  'label_surname',
  'label_company',
  'label_role',
  'label_saved_at',
  'label_source',
  'tags',
  'tag_sources',
  'fact_count',
  'employer',
  'occupation',
  'city',
  'industry',
  'seniority',
  'is_decision_maker',
  'owner_insights',
  'relationship',
  'relationship_strength',
  'via_warmth',
  'warm',
  'close_contact',
  'tier',
  'legacy_colour',
  'excluded',
  'blocked',
  'ties_written',
  'asks_sent',
  'asks_answered',
  'asks_declined',
  'asks_later',
  'asks_open',
  'introductions_asked',
  'invited',
  'senior_role',
] as const;

export const FACT_COLUMNS = [
  'contact_hash',
  'field_type',
  'value',
  'is_public',
  'source',
  'confidence',
  'submitted_by_user_id',
  'submitted_by_roster_key',
  'created_at',
] as const;

export function factRows(
  facts: readonly FactRow[],
  rosterKeyByUserId: ReadonlyMap<string, number>,
): Record<string, CsvValue>[] {
  return facts.map((f) => ({
    contact_hash: exportPhoneHash(f.contact_digits),
    field_type: f.field_type,
    value: f.value,
    is_public: f.is_public,
    source: f.source ?? '',
    confidence: f.confidence ?? '',
    submitted_by_user_id: f.submitted_by ?? '',
    submitted_by_roster_key: f.submitted_by ? (rosterKeyByUserId.get(f.submitted_by) ?? '') : '',
    created_at: f.created_at ? new Date(f.created_at).toISOString() : '',
  }));
}
