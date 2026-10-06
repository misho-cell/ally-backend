/**
 * Push quiet hours — Giorgi's decision, 2 October (G-002, team task 200; Misho:
 * „დაიწყე"): no PUSH between 23:00 and 09:30 in the recipient's own local
 * time. What would have gone out in that window is held and sent at 09:30
 * their time. Messages inside the app arrive at any time, as before; nothing
 * is dropped.
 *
 * The time zone is the DEVICE's — the phone says it when it subscribes
 * (`time_zone`) — because a push rings a device, and one person's laptop and
 * phone can sit in different zones. A device that has not said falls back to
 * Tbilisi, the clock every user had until now (D472).
 *
 * Pure functions only: the hold itself is in heldPushes.service.ts.
 */

/** Where quiet starts and ends, in minutes after local midnight. */
const MINUTES_PER_HOUR = 60;
export const QUIET_START_MINUTE = 23 * MINUTES_PER_HOUR;
export const QUIET_END_MINUTE = 9 * MINUTES_PER_HOUR + 30;
export const DEFAULT_PUSH_TIME_ZONE = 'Asia/Tbilisi';
/** Longer than any IANA name; a guard against an absurd value. */
const MAX_TIME_ZONE_CHARS = 64;

interface LocalTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly minuteOfDay: number;
}

/** A time zone the runtime knows, or null. Never throws. */
export function validTimeZone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const zone = value.trim();
  if (zone === '' || zone.length > MAX_TIME_ZONE_CHARS) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

/** The zone a device is held by: its own when valid, Tbilisi otherwise. */
export function pushTimeZone(deviceZone: string | null | undefined): string {
  return validTimeZone(deviceZone) ?? DEFAULT_PUSH_TIME_ZONE;
}

function localTime(at: Date, zone: string): LocalTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    minuteOfDay: part('hour') * MINUTES_PER_HOUR + part('minute'),
  };
}

export function isQuietHour(at: Date, zone: string): boolean {
  const { minuteOfDay } = localTime(at, zone);
  return minuteOfDay >= QUIET_START_MINUTE || minuteOfDay < QUIET_END_MINUTE;
}

/** How far the zone's wall clock is ahead of UTC at that instant, in ms. */
function zoneOffsetMs(at: Date, zone: string): number {
  const local = localTime(at, zone);
  const asIfUtc = Date.UTC(local.year, local.month - 1, local.day, 0, local.minuteOfDay);
  const atMinute = Math.floor(at.getTime() / 60_000) * 60_000;
  return asIfUtc - atMinute;
}

/**
 * The instant quiet ends next: 09:30 local, today if it is still before that,
 * tomorrow if quiet has just begun. Found by reading the zone's offset at the
 * target and correcting once, which also lands right on a day the clocks move.
 */
export function nextQuietEnd(at: Date, zone: string): Date {
  const local = localTime(at, zone);
  const dayAhead = local.minuteOfDay >= QUIET_START_MINUTE ? 1 : 0;
  const wallClock = Date.UTC(
    local.year,
    local.month - 1,
    local.day + dayAhead,
    0,
    QUIET_END_MINUTE,
  );
  const firstGuess = wallClock - zoneOffsetMs(new Date(wallClock), zone);
  return new Date(wallClock - zoneOffsetMs(new Date(firstGuess), zone));
}

/**
 * #1850: the next instant the zone's wall clock reads `minuteOfDay` — today
 * if that minute is still ahead, tomorrow otherwise — with the local date it
 * falls on (YYYY-MM-DD). Same offset correction as nextQuietEnd.
 */
export function nextLocalMinute(
  at: Date,
  zone: string,
  minuteOfDay: number,
): { readonly at: Date; readonly localDate: string } {
  const local = localTime(at, zone);
  const dayAhead = local.minuteOfDay >= minuteOfDay ? 1 : 0;
  const wallClock = Date.UTC(local.year, local.month - 1, local.day + dayAhead, 0, minuteOfDay);
  const firstGuess = wallClock - zoneOffsetMs(new Date(wallClock), zone);
  const instant = new Date(wallClock - zoneOffsetMs(new Date(firstGuess), zone));
  return { at: instant, localDate: new Date(wallClock).toISOString().slice(0, 10) };
}
