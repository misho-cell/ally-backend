import { query, withTransaction } from '../db/postgres/client';
import { isFictionalNumber } from './fictionalNumbers';
import { deleteMyAccount, ErasureReport } from './privacyRights.service';

/**
 * #8581 (the tester's 80985 and 81002; the founder's word relayed in 80985):
 * old fictional seats hold the reserved numbers, so new seats arrive already
 * saved in old phonebooks (reverse_ties 5). A test seat is erased with the
 * ordinary account erasure, and its numbers are given back: the do-not-contact
 * row the erasure writes is lifted for a fictional number, and other SEATS'
 * phonebook entries for it go. A real account is refused before anything runs.
 */
const SEAT_DELETE_TIMEOUT_MS = 8_000;

export interface SeatDeleteOutcome {
  readonly ok: true;
  readonly dryRun: boolean;
  readonly erasure: ErasureReport;
  readonly numbersFreed: number;
  readonly seatEntriesRemoved: number;
}

export type SeatDeleteResult = SeatDeleteOutcome | { readonly ok: false; readonly refusal: string };

async function seatPhones(seatId: number): Promise<string[] | null> {
  const seat = await query<{ phone: string | null }>(
    `SELECT s.phone FROM test_seats s WHERE s.user_id = $1
     UNION
     SELECT up.phone FROM "UserPhone" up
      WHERE up."userId" = $1 AND EXISTS (SELECT 1 FROM test_seats s WHERE s.user_id = $1)`,
    [seatId],
    SEAT_DELETE_TIMEOUT_MS,
  );
  if (seat.rows.length === 0) return null;
  return [...new Set(seat.rows.map((r) => r.phone).filter((p): p is string => p !== null))];
}

export async function deleteTestSeat(seatId: number, dryRun: boolean): Promise<SeatDeleteResult> {
  const phones = await seatPhones(seatId);
  if (phones === null) return { ok: false, refusal: 'not a test seat — refused' };
  const fictional = phones.filter(isFictionalNumber);
  if (fictional.length !== phones.length) {
    return { ok: false, refusal: 'the seat has a number outside the fictional ranges — refused' };
  }
  const erasure = await deleteMyAccount(String(seatId), dryRun);
  if (dryRun) {
    return { ok: true, dryRun, erasure, numbersFreed: fictional.length, seatEntriesRemoved: 0 };
  }
  const digits = fictional.map((p) => p.replace(/\D/gu, ''));
  const seatEntriesRemoved = await withTransaction(async (client) => {
    await client.query(
      `DELETE FROM phone_optouts WHERE phone_digits = ANY($1::text[]) AND reason = 'account_deleted'`,
      [digits],
    );
    const aliases = await client.query(
      `DELETE FROM "UserAlias" WHERE phone = ANY($1::text[])
        AND "contactId" IN (SELECT user_id FROM test_seats)`,
      [fictional],
    );
    const tags = await client.query(
      `DELETE FROM "UserTags" WHERE phone = ANY($1::text[])
        AND "contactId" IN (SELECT user_id FROM test_seats)`,
      [fictional],
    );
    await client.query('DELETE FROM test_seats WHERE user_id = $1', [seatId]);
    return (aliases.rowCount ?? 0) + (tags.rowCount ?? 0);
  });
  return { ok: true, dryRun, erasure, numbersFreed: fictional.length, seatEntriesRemoved };
}
