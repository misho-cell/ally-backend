/**
 * Misho, 26 Nov (point 5): „the way in is through the owner's own people. Do
 * not offer public numbers, emails or links, and do not hand the owner over to
 * reaching out alone. Give public contact details only when the owner asks
 * for them directly."
 *
 * What the web brings is shown to the model with its phone numbers and email
 * addresses hidden; a page's own address stays, so it can still be read. Only
 * a web step the model marks `public_contacts` (the owner asked, in this
 * turn) sees them, and only such a run may leave a link in its reply.
 */
export const PUBLIC_CONTACTS_PARAM = 'public_contacts';

export const PUBLIC_CONTACTS_PARAM_DESCRIPTION =
  'true ONLY when the owner asked you directly, in their latest message, for a public phone ' +
  'number, email address or link. Otherwise leave it out: phone numbers and emails on the web ' +
  'are hidden, and the way in is through the owner’s own people.';

export const CONTACT_HIDDEN = '[contact detail hidden]';

/** Fields that hold a page's own address: kept, so the page can still be read. */
const ADDRESS_FIELDS: ReadonlySet<string> = new Set(['url', 'source', 'link']);

const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/gu;
/** A phone number: an optional +, then digits with spaces, dashes, dots or brackets. */
const PHONE_RE = /\+?\(?\d[\d\s().-]{7,}\d/gu;
/**
 * A phone has at least this many digits, so prices and years stay. There is no
 * upper bound: ops, 27 Nov — two numbers printed side by side („599 12 34 56
 * 32 2 00 00 00") read as one run of 18 digits, stayed in the text, and were
 * then allowed one by one.
 */
const MIN_PHONE_DIGITS = 9;
const LINK_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'»”)\]]+/giu;
/**
 * Netai's own pages and its payment pages: an invite, a top-up or a plan link
 * the server made is the owner's own, never a public contact.
 */
const OWN_LINK_HOSTS: readonly string[] = ['netai.guru', 'stripe.com'];
/** What a Markdown link or a bracketed address leaves once its address is gone. */
const EMPTY_MARKDOWN_LINK_RE = /\[([^\]]+)\]\(\s*\)/gu;
const EMPTY_BRACKETS_RE = /\s?\(\s*\)/gu;
/** What a line holds once its links are gone, when nothing worth reading is left. */
const BARE_LINE_RE = /^[\s\p{P}\p{S}]*$/u;
/** A short label left standing alone („Site:") once the address after it is gone. */
const LABEL_ONLY_RE = /^[\s\p{P}\p{S}]*[\p{L}\p{N} ]{1,30}:\s*$/u;

function digitCount(text: string): number {
  return (text.match(/\d/gu) ?? []).length;
}

/** Pure: the text with its email addresses and phone numbers hidden. */
export function hiddenContactsIn(text: string): string {
  return text.replace(EMAIL_RE, CONTACT_HIDDEN).replace(PHONE_RE, (match) => {
    const digits = digitCount(match);
    return digits >= MIN_PHONE_DIGITS ? CONTACT_HIDDEN : match;
  });
}

/** Pure: a web result with every phone number and email in its text hidden; addresses kept. */
export function withoutPublicContacts(value: unknown, field: string | null = null): unknown {
  if (typeof value === 'string') {
    return field !== null && ADDRESS_FIELDS.has(field) ? value : hiddenContactsIn(value);
  }
  if (Array.isArray(value)) return value.map((item) => withoutPublicContacts(item, field));
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      withoutPublicContacts(item, key),
    ]),
  );
}

/** Whether a web step was asked for public contact details. */
export function askedForPublicContacts(input: Readonly<Record<string, unknown>>): boolean {
  return input[PUBLIC_CONTACTS_PARAM] === true;
}

function isOwnLink(link: string): boolean {
  try {
    const host = new URL(link.startsWith('www.') ? `https://${link}` : link).hostname;
    return OWN_LINK_HOSTS.some((own) => host === own || host.endsWith(`.${own}`));
  } catch {
    return false;
  }
}

/** Pure: the reply without public links and email addresses; a line left with nothing else goes too. */
export function withoutLinks(reply: string): string {
  const lines = reply.split('\n');
  const cleaned = lines.map((line) => {
    const plain = line
      .replace(LINK_RE, (link) => (isOwnLink(link) ? link : ''))
      .replace(EMAIL_RE, '')
      .replace(EMPTY_MARKDOWN_LINK_RE, '$1')
      .replace(EMPTY_BRACKETS_RE, '');
    return plain === line ? line : plain.replace(/[ \t]{2,}/gu, ' ').trimEnd();
  });
  const kept = cleaned.filter(
    (line, i) => line === lines[i] || !(BARE_LINE_RE.test(line) || LABEL_ONLY_RE.test(line)),
  );
  return kept
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

/** A sentence's end inside a line: the next one starts after it. */
const SENTENCE_END_RE = /(?<=[.!?…])\s+/u;

function holdsAContactDetail(sentence: string): boolean {
  const links = sentence.match(LINK_RE) ?? [];
  return hiddenContactsIn(sentence) !== sentence || links.some((link) => !isOwnLink(link));
}

/**
 * Lika, 27 Nov: the first answer from the web gave two print shops' phones,
 * emails and a list of links she never asked for (Misho, 26 Nov, point 5: none
 * unless the owner asks). Pure: the text without each sentence that holds a
 * phone number, an email or a public link — a sentence, so no „its contact
 * is ," is left behind; a line with nothing left goes too.
 */
export function withoutContactSentences(text: string): string {
  const original = text.split('\n');
  const lines = original.map((line) =>
    line
      .split(SENTENCE_END_RE)
      .filter((sentence) => !holdsAContactDetail(sentence))
      .join(' '),
  );
  const kept = lines.filter((line, i) => line === original[i] || line.trim() !== '');
  return kept
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function isWebShaped(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const v = value as { url?: unknown; content?: unknown; results?: unknown };
  if (typeof v.url === 'string' && 'content' in v) return true;
  return (
    Array.isArray(v.results) &&
    v.results.some(
      (r: unknown) =>
        r !== null && typeof r === 'object' && typeof (r as { url?: unknown }).url === 'string',
    )
  );
}

/**
 * Ops, 27 Nov (0ff66f7e's DONE WHEN): runs that searched nothing still showed
 * web numbers, read from web results an earlier run left in the conversation's
 * history. A stored tool result shaped like a web search or a page read is
 * hidden the same way before the model reads it again; any other result, and
 * anything that is not JSON, is left as it was.
 */
export function webResultTextWithoutContacts(text: string): string {
  if (!text.includes('http')) return text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }
  return isWebShaped(parsed) ? JSON.stringify(withoutPublicContacts(parsed)) : text;
}
