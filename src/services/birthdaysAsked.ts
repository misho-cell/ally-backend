import { birthdayFromNote, getUpcomingBirthdays } from './birthdayLens.service';

/**
 * 3269 (SE-039, ME-040): the owner told two birthdays, then asked „ვის აქვს
 * მალე დაბადების დღე?" in a new conversation; the app's run had no birthday
 * tool and said none were saved, 4 of 4. The server then answered such lines
 * itself, picked out by a word list.
 *
 * #8779 group 4 (the founder, 4 Nov): no fixed word lists. The app's run now
 * has the connector's own tool, and the model reads when the owner is asking.
 */
const SOON_DAYS = 30;
const MAX_SHOWN = 10;

export const GET_UPCOMING_BIRTHDAYS_TOOL = {
  name: 'get_upcoming_birthdays',
  description:
    'Birthdays the user has SAVED about their own contacts, soonest first, with how many ' +
    'days away each is. A warm, playful surface only — a reason to send a word on the day. ' +
    'NEVER use a birthday in matching, ranking, targeting or as an argument for an ' +
    'introduction. Returns only dates the user recorded themselves; it never reads another ' +
    "member's profile.",
  input_schema: {
    type: 'object' as const,
    properties: {
      days: { type: 'number', description: `How many days ahead to look (default ${SOON_DAYS}).` },
    },
    required: [] as string[],
  },
};

export interface UpcomingBirthdayRow {
  readonly name: string;
  readonly birthday: string;
  readonly days_until: number;
}

function windowDays(raw: unknown): number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : SOON_DAYS;
}

/** The told birthdays ahead, soonest first, named people only. */
export async function upcomingBirthdays(
  userId: string,
  days: unknown,
): Promise<UpcomingBirthdayRow[]> {
  const rows = await getUpcomingBirthdays(userId, windowDays(days));
  return [...rows]
    .filter((r) => (r.name ?? '').trim() !== '')
    .sort((a, b) => a.days_until - b.days_until)
    .slice(0, MAX_SHOWN)
    .map((r) => ({
      name: (r.name ?? '').trim(),
      birthday: birthdayFromNote('note', r.saved_as) ?? r.saved_as.trim(),
      days_until: r.days_until,
    }));
}
