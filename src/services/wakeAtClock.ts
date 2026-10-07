/**
 * #2179 (the tester's 44028, seat 177447): „remind me tomorrow at 10 in the
 * morning" was answered „I cannot remind at a set time" — set_task_wake took
 * hours only, and the model would not count them. The owner's clock time is
 * now given as it was said, and the server counts the hours, in the owner's
 * own time zone.
 */
const CLOCK_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/u;
const MS_PER_HOUR = 3_600_000;
const MS_PER_MINUTE = 60_000;
export const MAX_DAY_OFFSET = 7;

interface ClockTime {
  readonly hour: number;
  readonly minute: number;
}

/** „10:00" or „9:30"; null for anything else. */
export function parseClock(value: unknown): ClockTime | null {
  if (typeof value !== 'string') return null;
  const match = CLOCK_RE.exec(value.trim());
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
}

/** How far the zone's clock is ahead of UTC at this instant, in ms. */
function zoneOffsetMs(at: Date, zone: string): number {
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
  const asUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
  );
  return asUtc - Math.floor(at.getTime() / MS_PER_MINUTE) * MS_PER_MINUTE;
}

/** The instant the zone's clock shows `clock` on the day `dayOffset` days from its today. */
function instantAt(now: Date, zone: string, clock: ClockTime, dayOffset: number): Date {
  const local = new Date(now.getTime() + zoneOffsetMs(now, zone));
  const guess = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() + dayOffset,
    clock.hour,
    clock.minute,
  );
  // Twice, so a day that crosses a clock change lands on the right side of it.
  const first = guess - zoneOffsetMs(new Date(guess), zone);
  return new Date(guess - zoneOffsetMs(new Date(first), zone));
}

/**
 * Hours from now until the owner's clock shows `clock`. With no day given, the
 * next time it does — today if that is still ahead, else tomorrow.
 */
export function hoursUntilClock(
  now: Date,
  zone: string,
  clock: ClockTime,
  dayOffset: number | null,
): number {
  const offset = dayOffset === null ? 0 : Math.min(Math.max(0, dayOffset), MAX_DAY_OFFSET);
  const today = instantAt(now, zone, clock, offset);
  const target =
    dayOffset === null && today.getTime() <= now.getTime() ? instantAt(now, zone, clock, 1) : today;
  return (target.getTime() - now.getTime()) / MS_PER_HOUR;
}
