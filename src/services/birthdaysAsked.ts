import { birthdayFromNote, getUpcomingBirthdays, UpcomingBirthday } from './birthdayLens.service';
import { RunLanguage } from './runLanguage';

/**
 * 3269 (SE-039, ME-040; seats 180112, 180122, 180113, 179995): the owner told
 * two birthdays, then asked „ვის აქვს მალე დაბადების დღე?" in a new
 * conversation; the app's run has no birthday tool, and it said none were
 * saved, 4 of 4. The server answers it from the told birthdays, soonest first,
 * nobody else. No model runs.
 */
const SOON_DAYS = 30;
const MAX_SHOWN = 10;

const ASKS_FOR_BIRTHDAYS_RE =
  /(?:(?:ვის|ვისი)[\s\S]{0,40}დაბადების\s+დღე|დაბადების\s+დღე(?:ები)?[\s\S]{0,30}(?:მალე|ახლო|მოახლოებულ|ამ\s+თვეში)|(?:upcoming|soon|next)[\s\S]{0,30}birthdays?|birthdays?[\s\S]{0,30}(?:soon|coming\s+up|this\s+month)|у\s+кого[\s\S]{0,30}день\s+рождения|cumpleaños[\s\S]{0,30}(?:pronto|próximos))/iu;

export function asksForBirthdays(line: string): boolean {
  return ASKS_FOR_BIRTHDAYS_RE.test(line);
}

/** The told birthdays in the coming month, soonest first. */
export async function birthdaysSoon(userId: string): Promise<UpcomingBirthday[]> {
  const rows = await getUpcomingBirthdays(userId, SOON_DAYS);
  return [...rows].sort((a, b) => a.days_until - b.days_until).slice(0, MAX_SHOWN);
}

const TEXTS: Readonly<
  Record<'ka' | 'en', { lead: string; none: string; when: (days: number) => string }>
> = {
  ka: {
    lead: 'მალე დაბადების დღე აქვთ:',
    none: 'მომდევნო 30 დღეში შენახული დაბადების დღე არავისი მაქვს.',
    when: (days) => (days === 0 ? 'დღეს' : days === 1 ? 'ხვალ' : `${days} დღეში`),
  },
  en: {
    lead: 'Birthdays coming up:',
    none: 'No saved birthday falls in the next 30 days.',
    when: (days) => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`),
  },
};

/** The server's answer: each person as saved, the date as told, and how soon. */
export function birthdaysAnswer(rows: readonly UpcomingBirthday[], language: RunLanguage): string {
  const t = language === 'ka' ? TEXTS.ka : TEXTS.en;
  const named = rows.filter((r) => (r.name ?? '').trim() !== '');
  if (named.length === 0) return t.none;
  const lines = named.map(
    (r) =>
      `• ${(r.name ?? '').trim()} — ${birthdayFromNote('note', r.saved_as) ?? r.saved_as.trim()} (${t.when(r.days_until)})`,
  );
  return [t.lead, ...lines].join('\n');
}
