/**
 * Misho, 31 Oct (his chat: „ღამის აკრძალვა პირველ წერილზეც გაავრცელე"), after
 * the rule he agreed with the founder: no message written to a real person on
 * the server's own initiative between 03:00 and 08:30 Tbilisi time. A message a
 * person is answering in their own conversation is not held; this is for what
 * the server starts. Pure functions only.
 */
const MINUTES_PER_HOUR = 60;
export const NIGHT_START_MINUTE = 3 * MINUTES_PER_HOUR;
export const NIGHT_END_MINUTE = 8 * MINUTES_PER_HOUR + 30;
const NIGHT_ZONE = 'Asia/Tbilisi';

function tbilisiMinuteOfDay(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NIGHT_ZONE,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return part('hour') * MINUTES_PER_HOUR + part('minute');
}

/** True between 03:00 and 08:30 in Tbilisi, when nothing is started towards a real person. */
export function isRealUserNight(at: Date): boolean {
  const minute = tbilisiMinuteOfDay(at);
  return minute >= NIGHT_START_MINUTE && minute < NIGHT_END_MINUTE;
}
