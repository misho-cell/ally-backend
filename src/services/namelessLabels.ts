import { RunLanguage } from './runLanguage';

/**
 * 3137 (ME-011, seats 179900 and 179959, 8 Oct): a contact saved only as „💙",
 * tagged სტომატოლოგი. search_by_tag found it and handed it over as
 * `name: null, saved_as: "💙"` (row 283), and both replies said the contact
 * had no name and could not be told apart — the 💙 never reached the owner.
 * The owner saved them as 💙; that is how they find them. When the reply
 * leaves such a label out, the server says it.
 */
export interface NamelessLabel {
  readonly label: string;
  readonly tags: readonly string[];
}

const HAS_A_LETTER = /\p{L}/u;
/** At most this many labels are added to one reply. */
const MAX_LABEL_LINES = 3;
const MAX_TAGS_SHOWN = 2;

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** The letterless labels a search result carries (rows with no name, saved only as a symbol). */
export function namelessLabelsIn(raw: unknown): NamelessLabel[] {
  if (raw === null || typeof raw !== 'object') return [];
  const results = (raw as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const labels: NamelessLabel[] = [];
  for (const row of results) {
    if (row === null || typeof row !== 'object') continue;
    const r = row as { name?: unknown; saved_as?: unknown; tags?: unknown };
    const label = typeof r.saved_as === 'string' ? r.saved_as.trim() : '';
    if (r.name !== null && r.name !== undefined) continue;
    if (label === '' || HAS_A_LETTER.test(label)) continue;
    labels.push({ label, tags: asStrings(r.tags) });
  }
  return labels;
}

/** The labels the finished reply does not show, each once. */
export function labelsTheReplyLeftOut(
  labels: readonly NamelessLabel[],
  reply: string,
): NamelessLabel[] {
  const seen = new Set<string>();
  return labels.filter((l) => {
    if (seen.has(l.label) || reply.includes(l.label)) return false;
    seen.add(l.label);
    return true;
  });
}

const LINE: Readonly<Record<'ka' | 'en', (label: string, tags: string) => string>> = {
  ka: (label, tags) => `შენახული გყავს როგორც „${label}"${tags === '' ? '' : ` (${tags})`}.`,
  en: (label, tags) => `You have them saved as „${label}"${tags === '' ? '' : ` (${tags})`}.`,
};

/** The lines the server adds after the reply, one per label left out. */
export function namelessLabelLines(
  labels: readonly NamelessLabel[],
  language: RunLanguage,
): string {
  const line = language === 'ka' ? LINE.ka : LINE.en;
  return labels
    .slice(0, MAX_LABEL_LINES)
    .map((l) => line(l.label, l.tags.slice(0, MAX_TAGS_SHOWN).join(', ')))
    .join('\n');
}
