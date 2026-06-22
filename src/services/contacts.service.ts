import { PoolClient } from 'pg';
import { withTransaction } from '../db/postgres/client';
import pool from '../db/postgres/client';
import { getSession } from '../db/neo4j/client';
import { ImportContact, ImportResult } from '../types';
import { computeAndSaveSingleScore, enrichContact } from './enrichment.service';
import { buildCompositeKey, getCompositeKeysForPhones } from './neo4j.keys';

const MAX_CONTACTS_PER_IMPORT = 500;

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
  await withTransaction(async (client: PoolClient) => {
    await client.query(
      `INSERT INTO "UserAlias" (phone, "contactId", alias, "createdAt", "updatedAt")
       SELECT $1, $2, $3, NOW(), NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM "UserAlias" WHERE phone = $1 AND "contactId" = $2 AND alias = $3
       )`,
      [phone, userId, contact.name.trim()],
    );

    const tags = buildTags(contact);
    for (const tag of tags) {
      await client.query(
        `INSERT INTO "UserTags" (phone, "contactId", tag, "weightCount", "createdAt", "updatedAt")
         SELECT $1, $2, $3, 1, NOW(), NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM "UserTags" WHERE phone = $1 AND "contactId" = $2 AND tag = $3
         )`,
        [phone, userId, tag],
      );
    }
  });
}

function buildTags(contact: ImportContact): string[] {
  const parts: string[] = contact.name
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p.length > 1);

  if (contact.employer) parts.push(contact.employer.toLowerCase());
  if (contact.jobPosition) parts.push(contact.jobPosition.toLowerCase());
  if (contact.city) parts.push(contact.city.toLowerCase());

  return [...new Set(parts)];
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
