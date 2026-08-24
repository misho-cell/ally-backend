import { PoolClient } from 'pg';
import { withTransaction } from '../db/postgres/client';
import pool from '../db/postgres/client';
import { getSession } from '../db/neo4j/client';
import { ImportContact, ImportResult } from '../types';
import { computeAndSaveSingleScore, enrichContact } from './enrichment.service';
import { buildCompositeKey, getCompositeKeysForPhones } from './neo4j.keys';
import { hasGeorgian, georgianToLatin } from './tools/transliterate';
import { parsePhonebookLabelsForUser } from './labelParser.service';

const MAX_CONTACTS_PER_IMPORT = 500;
// Prod "TagSource" enum value for tags born from a phonebook import.
const TAG_SOURCE_IMPORTED = 'IMPORTED_CONTACT';
// Provenance stamp for UserAlias rows this endpoint writes (migration 068):
// the three-phantom-contacts question was unanswerable without it.
const ALIAS_SOURCE_IMPORT = 'app_import';

export async function getUserPhone(userId: string): Promise<string> {
  const result = await pool.query<{ phone: string }>(
    'SELECT phone FROM "UserPhone" WHERE "userId" = $1 LIMIT 1',
    [userId],
  );
  if (result.rows.length === 0) {
    throw new Error('User phone not found');
  }
  return result.rows[0].phone;
}

export async function getUserPhones(userId: string): Promise<string[]> {
  const result = await pool.query<{ phone: string }>(
    'SELECT phone FROM "UserPhone" WHERE "userId" = $1 ORDER BY phone',
    [userId],
  );
  if (result.rows.length === 0) {
    throw new Error('User phone not found');
  }
  return result.rows.map((r) => r.phone);
}

export async function importContacts(
  userId: string,
  contacts: ImportContact[],
): Promise<ImportResult> {
  const userPhones = await getUserPhones(userId);
  const userPhoneSet = new Set(userPhones);
  const userCompositeKey = buildCompositeKey(userPhones);
  const batch = contacts.slice(0, MAX_CONTACTS_PER_IMPORT);

  let imported = 0;
  let skipped = 0;

  for (const contact of batch) {
    const counts = await importSingleContact(userId, userPhoneSet, userCompositeKey, contact);
    imported += counts.imported;
    skipped += counts.skipped;
  }

  // ALARM, not a shrug: an import that saves nothing from non-empty input is
  // the exact silent data-loss shape that ran unnoticed for 16 days (5–21
  // Aug). The per-phone errors are already logged above; this line is the
  // one to alert on.
  if (imported === 0 && skipped > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `[ALARM][import] user ${userId}: 0 of ${skipped} contacts saved — every row failed or was rejected`,
    );
  }

  // Engine T2, fire-and-forget: the import response must not wait on 500
  // labels being parsed. A failure here is a starter-fact opportunity
  // missed, never a reason to fail the import itself.
  void parsePhonebookLabelsForUser(userId).catch((err: unknown) =>
    // eslint-disable-next-line no-console
    console.error(`[label-parser] user ${userId} failed:`, (err as Error).message),
  );

  return { imported, skipped };
}

async function importSingleContact(
  userId: string,
  userPhoneSet: Set<string>,
  userCompositeKey: string,
  contact: ImportContact,
): Promise<ImportResult> {
  if (!contact.name.trim() || contact.phones.length === 0) {
    return { imported: 0, skipped: 1 };
  }

  let imported = 0;
  let skipped = 0;

  for (const rawPhone of contact.phones) {
    const phone = normalizePhone(rawPhone);
    if (!phone || userPhoneSet.has(phone)) {
      skipped++;
      continue;
    }

    try {
      await saveToPostgres(userId, phone, contact);
      const contactKeyMap = await getCompositeKeysForPhones([phone]);
      const contactKey = contactKeyMap.get(phone) ?? phone;
      await saveToNeo4j(userCompositeKey, phone, contactKey, contact);
      triggerEnrichmentAsync(Number(userId), userCompositeKey, phone, contact.name.trim());
      imported++;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Failed to import contact phone=${phone}:`, (err as Error).message);
      skipped++;
    }
  }

  return { imported, skipped };
}

function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s()-]/g, '');
  if (!cleaned.startsWith('+')) return null;
  if (cleaned.length < 8 || cleaned.length > 16) return null;
  return cleaned;
}

function triggerEnrichmentAsync(
  userId: number,
  userCompositeKey: string,
  contactPhone: string,
  alias: string,
): void {
  Promise.all([
    computeAndSaveSingleScore(userId, userCompositeKey, contactPhone, alias),
    enrichContact(contactPhone),
  ]).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`[enrichment] Async trigger failed for ${contactPhone}:`, (err as Error).message);
  });
}

async function saveToPostgres(
  userId: string,
  phone: string,
  contact: ImportContact,
): Promise<void> {
  // Column lists match the LIVE prod schema exactly: UserAlias(id, userId,
  // contactId, alias, phone) and UserTags(id, userId, contactId, tag, phone,
  // weightCount, source) carry NO createdAt/updatedAt — writing them made
  // every import silently fail (each contact error-counted as "skipped").
  // Verified against information_schema on 2 Aug. The upsert also avoids
  // ON CONFLICT: the unique constraint it needs is not provable in prod.
  // The reused parameters are cast ONCE, at their first occurrence: a bare $1
  // in an INSERT…SELECT list and the same $1 in the WHERE resolve to different
  // types on PostgreSQL 17, and every import died with "inconsistent types
  // deduced for parameter $1". Prod has run 17.7 since May (postmaster start
  // 25 May) — this endpoint was broken from its 5-Aug rewrite until 21 Aug
  // and nobody noticed, because the apps import through the legacy service.
  await withTransaction(async (client: PoolClient) => {
    await client.query(
      `INSERT INTO "UserAlias" (phone, "contactId", alias, source)
       SELECT $1::text, $2::int, $3::text, $4::text
       WHERE NOT EXISTS (
         SELECT 1 FROM "UserAlias" WHERE phone = $1 AND "contactId" = $2 AND alias = $3
       )`,
      [phone, userId, contact.name.trim(), ALIAS_SOURCE_IMPORT],
    );

    const tags = buildTags(contact);
    for (const tag of tags) {
      const bumped = await client.query(
        `UPDATE "UserTags" SET "weightCount" = "weightCount" + 1
         WHERE phone = $1 AND "contactId" = $2 AND tag = $3`,
        [phone, userId, tag],
      );
      if ((bumped.rowCount ?? 0) === 0) {
        // source is NOT NULL with no default in prod (the 2 Aug schema check
        // predates that) — omitting it aborted the whole import transaction.
        await client.query(
          `INSERT INTO "UserTags" (phone, "contactId", tag, "weightCount", source)
           SELECT $1::text, $2::int, $3::text, 1, $4::"TagSource"
           WHERE NOT EXISTS (
             SELECT 1 FROM "UserTags" WHERE phone = $1 AND "contactId" = $2 AND tag = $3
           )`,
          [phone, userId, tag, TAG_SOURCE_IMPORTED],
        );
      }
    }
  });
}

const NUMERIC_ONLY_RE = /^\d+$/;
const HAS_LETTER_RE = /\p{L}/u;
const TAG_STOP_WORDS = new Set([
  'კი',
  'არა',
  'და',
  'ან',
  'ამ',
  'ეს',
  'ის',
  'მე',
  'შენ',
  'ჩვენ',
  'თქვენ',
  'ok',
  'yes',
  'no',
  'mr',
  'ms',
  'dr',
]);

function isValidTag(tag: string): boolean {
  if (tag.length < 2) return false;
  if (NUMERIC_ONLY_RE.test(tag)) return false;
  if (!HAS_LETTER_RE.test(tag)) return false;
  if (TAG_STOP_WORDS.has(tag)) return false;
  return true;
}

function buildTags(contact: ImportContact): string[] {
  const parts: string[] = contact.name.toLowerCase().split(/\s+/).filter(isValidTag);

  if (contact.employer) parts.push(contact.employer.toLowerCase());
  if (contact.jobPosition) parts.push(contact.jobPosition.toLowerCase());
  if (contact.city) parts.push(contact.city.toLowerCase());

  // Store the Latin transliteration ALONGSIDE each Georgian token, so a
  // Latin-script query reaches the contact without depending on runtime query
  // expansion or the fuzzy index (the write-side half of the name-sync gap:
  // spelling forgiveness only existed at search time). Existing rows are
  // untouched — backfill is a separate, deliberate job.
  for (const part of [...parts]) {
    if (hasGeorgian(part)) {
      const latin = georgianToLatin(part);
      if (latin !== part) parts.push(latin);
    }
  }

  return [...new Set(parts)].filter(isValidTag);
}

async function saveToNeo4j(
  userKey: string,
  contactPhone: string,
  contactKey: string,
  contact: ImportContact,
): Promise<void> {
  const session = getSession();
  try {
    await session.run(
      `MERGE (u:AllyNode {phoneKey: $userKey})
       MERGE (c:AllyNode {phoneKey: $contactKey})
       MERGE (u)-[r:CONTACT]->(c)
       SET r.name        = $name,
           r.email       = $email,
           r.employer    = $employer,
           r.jobPosition = $jobPosition,
           r.city        = $city,
           r.updatedAt   = datetime()`,
      {
        userKey,
        contactKey,
        name: contact.name.trim(),
        email: contact.email ?? null,
        employer: contact.employer ?? null,
        jobPosition: contact.jobPosition ?? null,
        city: contact.city ?? null,
      },
    );
  } finally {
    await session.close();
  }
}

export function parseVcf(vcfContent: string): ImportContact[] {
  const cards = vcfContent.split(/(?=BEGIN:VCARD)/i).filter((c) => c.trim());
  return cards.map(parseCard).filter((c): c is ImportContact => c !== null);
}

function parseCard(card: string): ImportContact | null {
  const lines = unfoldVcf(card).split('\n');
  const props: Record<string, string[]> = {};

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).split(';')[0].toUpperCase().trim();
    const value = line.slice(colonIdx + 1).trim();
    if (!key || !value) continue;
    if (!props[key]) props[key] = [];
    props[key].push(value);
  }

  const fn = props['FN']?.[0]?.trim();
  const n = props['N']?.[0]?.replace(/;/g, ' ').replace(/\s+/g, ' ').trim();
  const name = fn || n || null;
  if (!name) return null;

  const phones = (props['TEL'] ?? []).map((t) => t.replace(/\s+/g, '')).filter((t) => t.length > 0);
  if (phones.length === 0) return null;

  return {
    name,
    phones,
    email: props['EMAIL']?.[0]?.trim() || undefined,
    employer: props['ORG']?.[0]?.split(';')[0]?.trim() || undefined,
    jobPosition: props['TITLE']?.[0]?.trim() || undefined,
    city: extractCityFromAdr(props['ADR']?.[0]),
  };
}

function unfoldVcf(vcf: string): string {
  return vcf
    .replace(/\r\n[ \t]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function extractCityFromAdr(adr: string | undefined): string | undefined {
  if (!adr) return undefined;
  // ADR format: pobox;ext;street;city;region;postal;country
  const city = adr.split(';')[3]?.trim();
  return city || undefined;
}

export async function createUserPhoneNode(phone: string): Promise<void> {
  const session = getSession();
  try {
    await session.run('MERGE (u:AllyNode {phoneKey: $phone})', { phone });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to create Neo4j AllyNode for phone:', phone, (err as Error).message);
  } finally {
    await session.close();
  }
}
