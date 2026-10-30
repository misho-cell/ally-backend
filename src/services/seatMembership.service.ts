import { addRosterMember, removeRosterMember } from './roster.service';
import { inviterSeatPhone } from './testSeatCreate.service';

/**
 * #7758 (tester 79008, „DONE WHEN says fictional seats"): the tester puts a
 * community on a FICTIONAL seat, current or former, to run „a former member is
 * never called current". The same roster writes a real list uses; a real
 * account is refused by the seat lookup before anything is written.
 */
export enum SeatMembershipStatus {
  Current = 'current',
  Former = 'former',
}

export function isSeatMembershipStatus(v: unknown): v is SeatMembershipStatus {
  return Object.values(SeatMembershipStatus).includes(v as SeatMembershipStatus);
}

/** True when the seat's membership changed. Throws SeatCreationRefused for a real account. */
export async function setSeatMembership(
  seatId: number,
  group: string,
  status: SeatMembershipStatus,
  curator: string,
): Promise<boolean> {
  const phone = await inviterSeatPhone(String(seatId));
  if (status === SeatMembershipStatus.Current) {
    return (await addRosterMember(group, phone, curator)).changed;
  }
  const removed = await removeRosterMember(group, phone);
  const marked = await addRosterMember(group, phone, curator, { former: true });
  return removed.changed || marked.changed;
}
