import Anthropic from '@anthropic-ai/sdk';
import { recordClaudeUsage } from './costLedger.service';
import { query } from '../db/postgres/client';
import { getSession } from '../db/neo4j/client';
import anthropic from '../config/anthropic';
import { getCompositeKeyForPhone, getCompositeKeysForPhones } from './neo4j.keys';

const FAMILY_KEYWORDS_UNAMBIGUOUS = [
  'დედა',
  'მამა',
  'ძმა',
  'ბებია',
  'პაპა',
  'ცოლი',
  'ქმარი',
  'შვილი',
  'ძია',
  'მამიდა',
  'დეიდა',
  'ბიძა',
  'ნათლია',
  'ნათლიდედა',
  'მამამთილი',
  'დედამთილი',
  'მაზლი',
  'რძალი',
  'სიძე',
  'ძმისშვილი',
  'დისშვილი',
  'შვილიშვილი',
  'ბიძაშვილი',
  'მამიდაშვილი',
  'დეიდაშვილი',
] as const;

const CLOSE_EMOJI_RE = /[♥❤💕💖🥰😍💗💓💞💝❣]/u;

const PROFESSIONAL_KEYWORDS = [
  'ბოსი',
  'უფროსი',
  'director',
  'ceo',
  'manager',
  'chief',
  'president',
  'head of',
  'dr.',
  'prof.',
  'ბატონი',
  'ქალბატონი',
] as const;

const COUNTRY_CODES: Record<string, string> = {
  '+995': 'Georgia',
  '+7': 'Russia',
  '+374': 'Armenia',
  '+994': 'Azerbaijan',
  '+380': 'Ukraine',
  '+375': 'Belarus',
  '+1': 'USA/Canada',
  '+44': 'UK',
  '+49': 'Germany',
  '+33': 'France',
  '+39': 'Italy',
  '+34': 'Spain',
  '+90': 'Turkey',
  '+972': 'Israel',
  '+971': 'UAE',
};

const BIDIRECTIONALITY_BONUS = 0.1;
const AI_MODEL = 'claude-haiku-4-5-20251001';

export interface RelationshipSignals {
  family_keyword?: boolean;
  close_emoji?: boolean;
  single_name?: boolean;
  professional_keyword?: boolean;
  full_name?: boolean;
  bidirectional?: boolean;
}

export interface RelationshipScore {
  relationship_type: string;
  strength_score: number;
  signals: RelationshipSignals;
}

interface ContactRawData {
  aliases: string[];
  employers: string[];
  jobPositions: string[];
  countryCode: string | null;
}

interface AiEnrichmentResult {
  gender: string;
  gender_confidence: number;
  nationality: string | null;
  nationality_confidence: number;
  industry: string | null;
  industry_confidence: number;
  seniority: string | null;
  is_decision_maker: boolean | null;
}

interface WeightUpdate {
  userKey: string;
  contactKey: string;
  weight: number;
}

function hasFamilyKeyword(alias: string): boolean {
  const lower = alias.toLowerCase();
  if (FAMILY_KEYWORDS_UNAMBIGUOUS.some((k) => lower.includes(k))) return true;
  return /(?:^|\s)და(?:\s|$)/.test(lower);
}

export function extractCountryCode(phone: string): string | null {
  const sorted = Object.keys(COUNTRY_CODES).sort((a, b) => b.length - a.length);
  for (const code of sorted) {
    if (phone.startsWith(code)) return code;
  }
  return null;
}

export function computeRelationshipScore(
  alias: string,
  isBidirectional: boolean,
): RelationshipScore {
  const lower = alias.toLowerCase();
  const signals: RelationshipSignals = {};
  const bonus = isBidirectional ? BIDIRECTIONALITY_BONUS : 0;
  if (isBidirectional) signals.bidirectional = true;

  if (hasFamilyKeyword(alias)) {
    signals.family_keyword = true;
    return { relationship_type: 'family', strength_score: Math.min(1, 0.9 + bonus), signals };
  }
  if (CLOSE_EMOJI_RE.test(alias)) {
    signals.close_emoji = true;
    return { relationship_type: 'close', strength_score: Math.min(1, 0.8 + bonus), signals };
  }
  const words = alias
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 1) {
    signals.single_name = true;
    return { relationship_type: 'close', strength_score: Math.min(1, 0.65 + bonus), signals };
  }
  if (PROFESSIONAL_KEYWORDS.some((k) => lower.includes(k))) {
    signals.professional_keyword = true;
    return { relationship_type: 'professional', strength_score: Math.min(1, 0.4 + bonus), signals };
  }
  signals.full_name = true;
  return { relationship_type: 'formal', strength_score: Math.min(1, 0.4 + bonus), signals };
}

async function getBidirectionalSet(userKey: string, contactKeys: string[]): Promise<Set<string>> {
  if (contactKeys.length === 0) return new Set();
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (me:AllyNode {phoneKey: $userKey})<-[:CONTACT]-(c:AllyNode)
       WHERE c.phoneKey IN $contactKeys
       RETURN c.phoneKey AS key`,
      { userKey, contactKeys },
      { timeout: 8000 },
    );
    return new Set(result.records.map((r) => r.get('key') as string));
  } finally {
    await session.close();
  }
}

async function saveRelationshipScore(
  userId: number,
  contactPhone: string,
  score: RelationshipScore,
): Promise<void> {
  await query(
    `INSERT INTO contact_relationship_scores
       (user_id, contact_phone, relationship_type, strength_score, signals, computed_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id, contact_phone) DO UPDATE
       SET relationship_type = $3, strength_score = $4, signals = $5, computed_at = NOW()`,
    [
      userId,
      contactPhone,
      score.relationship_type,
      score.strength_score,
      JSON.stringify(score.signals),
    ],
  );
}

export async function updateNeo4jWeightsBatch(updates: WeightUpdate[]): Promise<void> {
  if (updates.length === 0) return;
  const session = getSession();
  try {
    await session.run(
      `UNWIND $updates AS u
       MATCH (a:AllyNode {phoneKey: u.userKey})-[r:CONTACT]->(b:AllyNode {phoneKey: u.contactKey})
       SET r.weight = u.weight`,
      { updates },
      { timeout: 30000 },
    );
  } finally {
    await session.close();
  }
}

export async function computeAndSaveUserScores(
  userId: number,
  userCompositeKey: string,
): Promise<void> {
  const aliasResult = await query<{ phone: string; alias: string }>(
    `SELECT DISTINCT ON (phone) phone, alias
     FROM "UserAlias"
     WHERE "contactId" = $1
     ORDER BY phone, LENGTH(alias) DESC`,
    [userId],
  );
  if (aliasResult.rows.length === 0) return;

  const contactPhones = aliasResult.rows.map((r) => r.phone);
  const contactKeyMap = await getCompositeKeysForPhones(contactPhones);
  const contactKeys = [...new Set(contactPhones.map((p) => contactKeyMap.get(p) ?? p))];

  const bidirectional = await getBidirectionalSet(userCompositeKey, contactKeys);
  const weightUpdates: WeightUpdate[] = [];

  for (const row of aliasResult.rows) {
    const contactKey = contactKeyMap.get(row.phone) ?? row.phone;
    const score = computeRelationshipScore(row.alias, bidirectional.has(contactKey));
    await saveRelationshipScore(userId, row.phone, score);
    weightUpdates.push({ userKey: userCompositeKey, contactKey, weight: score.strength_score });
  }

  await updateNeo4jWeightsBatch(weightUpdates);
}

export async function computeAndSaveSingleScore(
  userId: number,
  userCompositeKey: string,
  contactPhone: string,
  alias: string,
): Promise<void> {
  const contactKey = await getCompositeKeyForPhone(contactPhone);
  const bidirectional = await getBidirectionalSet(userCompositeKey, [contactKey]);
  const score = computeRelationshipScore(alias, bidirectional.has(contactKey));
  await saveRelationshipScore(userId, contactPhone, score);
  await updateNeo4jWeightsBatch([
    { userKey: userCompositeKey, contactKey, weight: score.strength_score },
  ]);
}

async function getContactRawData(phone: string): Promise<ContactRawData> {
  const aliasResult = await query<{ alias: string }>(
    'SELECT DISTINCT alias FROM "UserAlias" WHERE phone = $1 LIMIT 10',
    [phone],
  );

  const contactKey = await getCompositeKeyForPhone(phone);
  const session = getSession();
  let employers: string[] = [];
  let jobPositions: string[] = [];
  try {
    const neo4jResult = await session.run(
      `MATCH ()-[r:CONTACT]->(c:AllyNode {phoneKey: $contactKey})
       WHERE r.employer IS NOT NULL OR r.jobPosition IS NOT NULL
       RETURN r.employer AS employer, r.jobPosition AS jobPosition LIMIT 5`,
      { contactKey },
      { timeout: 5000 },
    );
    employers = neo4jResult.records
      .map((r) => r.get('employer') as string | null)
      .filter((e): e is string => Boolean(e));
    jobPositions = neo4jResult.records
      .map((r) => r.get('jobPosition') as string | null)
      .filter((j): j is string => Boolean(j));
  } finally {
    await session.close();
  }

  return {
    aliases: aliasResult.rows.map((r) => r.alias),
    employers: [...new Set(employers)],
    jobPositions: [...new Set(jobPositions)],
    countryCode: extractCountryCode(phone),
  };
}

function buildEnrichmentPrompt(data: ContactRawData): string {
  const parts: string[] = [];
  if (data.aliases.length > 0) parts.push(`Names: ${data.aliases.join(', ')}`);
  if (data.countryCode) parts.push(`Phone code: ${data.countryCode}`);
  if (data.employers.length > 0) parts.push(`Employer: ${data.employers.join(', ')}`);
  if (data.jobPositions.length > 0) parts.push(`Job: ${data.jobPositions.join(', ')}`);

  return `Contact data: ${parts.join('. ')}.
Return JSON only:
{"gender":"male|female|unknown","gender_confidence":0.0,"nationality":null,"nationality_confidence":0.0,"industry":null,"industry_confidence":0.0,"seniority":null,"is_decision_maker":null}`;
}

async function runAiEnrichment(data: ContactRawData): Promise<AiEnrichmentResult | null> {
  if (!data.aliases.length && !data.employers.length && !data.jobPositions.length) return null;

  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 200,
    messages: [{ role: 'user', content: buildEnrichmentPrompt(data) }],
  });

  void recordClaudeUsage({
    userId: null,
    kind: 'enrichment',
    model: AI_MODEL,
    usage: response.usage,
  }).catch(() => {});

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  try {
    return JSON.parse(text) as AiEnrichmentResult;
  } catch {
    return null;
  }
}

export async function enrichContact(phone: string): Promise<void> {
  const data = await getContactRawData(phone);
  const nationalityFromPhone = data.countryCode ? (COUNTRY_CODES[data.countryCode] ?? null) : null;
  const aiResult = await runAiEnrichment(data);

  await query(
    `INSERT INTO contact_enrichment
       (phone, gender, gender_confidence, country_code, nationality,
        nationality_source, nationality_confidence, industry, industry_confidence,
        seniority, is_decision_maker, enriched_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
     ON CONFLICT (phone) DO UPDATE SET
       gender=$2, gender_confidence=$3, country_code=$4, nationality=$5,
       nationality_source=$6, nationality_confidence=$7, industry=$8,
       industry_confidence=$9, seniority=$10, is_decision_maker=$11, updated_at=NOW()`,
    [
      phone,
      aiResult?.gender ?? 'unknown',
      aiResult?.gender_confidence ?? null,
      data.countryCode,
      aiResult?.nationality ?? nationalityFromPhone,
      aiResult?.nationality ? 'name_inference' : data.countryCode ? 'phone_code' : null,
      aiResult?.nationality_confidence ?? (nationalityFromPhone ? 1.0 : null),
      aiResult?.industry ?? null,
      aiResult?.industry_confidence ?? null,
      aiResult?.seniority ?? null,
      aiResult?.is_decision_maker ?? null,
    ],
  );
}
