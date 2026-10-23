import { query } from '../db/postgres/client';
import { findContactPhonesByName } from './tools/nameMatch';

/**
 * The tester's 995 #5: an English-speaking mediator read „introduce them to
 * სანდრო" — the ASKER's label for the person, in the asker's script. The
 * mediator knows that person under his own name for them; that is the name
 * his side of the request uses, whenever it can be found exactly.
 *
 * The number: the one on the request, else EXACTLY ONE match for the asker's
 * name in the mediator's book, else exactly one of his contacts registered on
 * Netai under that name. Anything else keeps the asker's name, which is what
 * every request showed before.
 *
 * 3895 (the tester's 58347, 0 of 3): Levan saved the target as „ბექუნა
 * ფოტოგრაფი"; the owner typed „ბექა მაისურაძე", the target's registered name.
 * The card said „ბექა მაისურაძეს" 3 of 3, for two reasons: the owner's words
 * are not in Levan's label, so the name match found nobody; and the name read
 * for a number (nameInBridgeBook) prefers the REGISTERED name to the label.
 * The card is the mediator's, so it reads his label.
 */
const MEDIATOR_NAME_TIMEOUT_MS = 3_000;
const AT_MOST_TWO = 2;

export async function targetNameForMediator(
  mediatorUserId: number,
  askerUserId: number,
  askersName: string,
  targetPhone: string | null,
): Promise<string> {
  try {
    // #6601 / #6602 retest (seat 190122): the asker's label („my buddy") came
    // with no number and the go-between has no such word, so nothing matched.
    // The asker's own book knows the number behind his label.
    const phone =
      targetPhone ??
      (await onlyMatch(mediatorUserId, askersName)) ??
      (await onlyRegisteredContact(mediatorUserId, askersName)) ??
      (await onlyMatch(askerUserId, askersName));
    if (phone === null) return askersName;
    // #6601 / #6602 (Giorgi, 20 Oct): a go-between who has not saved the target
    // read the asker's own word for him („chemi") in the card and the message.
    // The name the target registered with comes before the asker's label.
    return (
      (await mediatorsOwnLabel(mediatorUserId, phone)) ??
      (await registeredNameOf(phone)) ??
      askersName
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      '[intro] could not read the mediator’s name for the target:',
      (err as Error).message,
    );
    return askersName;
  }
}

/** Exactly one contact in this member's own book answers to the name. */
async function onlyMatch(bookOwnerId: number, name: string): Promise<string | null> {
  const matches = await findContactPhonesByName(String(bookOwnerId), name, AT_MOST_TWO);
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

/** Exactly one of the mediator's contacts is registered on Netai under this very name. */
async function onlyRegisteredContact(mediatorUserId: number, name: string): Promise<string | null> {
  const result = await query<{ phone: string }>(
    `SELECT DISTINCT ua.phone
       FROM "UserAlias" ua
       JOIN "UserPhone" up ON up.phone = ua.phone
       JOIN "User" u ON u.id = up."userId"
      WHERE ua."contactId" = $1::int
        AND u."deletedAt" IS NULL
        AND LOWER(TRIM(u.name)) = LOWER(TRIM($2))
      LIMIT $3`,
    [mediatorUserId, name, AT_MOST_TWO],
    MEDIATOR_NAME_TIMEOUT_MS,
  );
  return result.rows.length === 1 ? (result.rows[0]?.phone ?? null) : null;
}

/** The mediator's own label for the number, compared as digits; null when he has none. */
async function mediatorsOwnLabel(mediatorUserId: number, phone: string): Promise<string | null> {
  const result = await query<{ alias: string }>(
    `SELECT TRIM(ua.alias) AS alias
       FROM "UserAlias" ua
      WHERE ua."contactId" = $1::int
        AND regexp_replace(ua.phone, '\\D', '', 'g') = regexp_replace($2, '\\D', '', 'g')
        AND NULLIF(TRIM(ua.alias), '') IS NOT NULL
      ORDER BY ua.id DESC
      LIMIT 1`,
    [mediatorUserId, phone],
    MEDIATOR_NAME_TIMEOUT_MS,
  );
  return result.rows[0]?.alias || null;
}

/** The name the person behind this number registered with in Netai, or null. */
async function registeredNameOf(phone: string): Promise<string | null> {
  const result = await query<{ name: string }>(
    `SELECT TRIM(u.name) AS name
       FROM "UserPhone" up
       JOIN "User" u ON u.id = up."userId"
      WHERE regexp_replace(up.phone, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g')
        AND u."deletedAt" IS NULL
        AND NULLIF(TRIM(u.name), '') IS NOT NULL
      LIMIT 1`,
    [phone],
    MEDIATOR_NAME_TIMEOUT_MS,
  );
  return result.rows[0]?.name ?? null;
}
