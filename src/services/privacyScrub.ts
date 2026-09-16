// Phone-number scrubber shared by every surface that can emit free text to a
// client or model: the MCP connector's tool results and the in-app agent's
// streamed narration / final answers. Phone-shaped runs of digits are redacted
// server-side so they can never reach Claude's context or the chat UI. ISO
// dates and short numeric runs (ages, counts, house numbers) are spared.

const PHONE_LIKE_PATTERN = '\\+?\\d[\\d\\s\\-().]{5,}\\d';
const PHONE_KEY_RE = /phone|msisdn/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Year ranges ("2015-2017", "2015 - 2017") are education/work dates, not phones.
const YEAR_RANGE_RE = /^(19|20)\d{2}\s?[-–—]\s?(19|20)\d{2}$/;
const REDACTED = '[hidden]';
// Georgian numbers are 9 digits local / 12 with the country code. 8-digit runs
// were over-masking real content (a year range is 8 digits) — see the battery
// finding "[hidden] ადამიანი" / "FreeUni/ESM, [hidden]".
const MIN_PHONE_DIGITS = 9;

function redactCandidate(match: string): string {
  const trimmed = match.trim();
  if (ISO_DATE_RE.test(trimmed) || YEAR_RANGE_RE.test(trimmed)) return match;
  // A run of ADJACENT standalone numbers ("1500 2000 3000", "2015-2017
  // 2018-2020") is not one phone: real spaced phones break into 2-3 digit
  // groups ("+995 599 12 34 56"), while lists of counts/years/prices come in
  // chunks of 4+ digits each. Judge such chunks individually instead of
  // summing digits across the whole run — summing is what masked real content.
  const chunks = trimmed.split(/\s+/);
  if (chunks.length > 1 && chunks.every((c) => c.replace(/\D/g, '').length >= 4)) {
    const anyChunkIsPhone = chunks.some((c) => c.replace(/\D/g, '').length >= MIN_PHONE_DIGITS);
    return anyChunkIsPhone ? REDACTED : match;
  }
  const digitCount = match.replace(/\D/g, '').length;
  return digitCount >= MIN_PHONE_DIGITS ? REDACTED : match;
}

// Explicit-consent passthrough: ONLY the get_own_contact_number tool wraps a
// number in these markers (the user's own direct contact, on their explicit
// request). scrubText carries the span through UNTOUCHED (markers included, so
// repeated scrub passes stay idempotent); the display boundaries call
// stripAllowedSpans() to reveal the number at the last moment. Any number
// OUTSIDE a marker pair is scrubbed exactly as before.
export const ALLOW_OPEN = '⟦own⟧';
export const ALLOW_CLOSE = '⟦/own⟧';
const ALLOW_SPAN_RE = /⟦own⟧[\s\S]*?⟦\/own⟧/g;

export function scrubText(text: string): string {
  return text
    .split(ALLOW_SPAN_RE)
    .map((part) => part.replace(new RegExp(PHONE_LIKE_PATTERN, 'g'), redactCandidate))
    .reduce((acc, part, i) => {
      const spans = text.match(ALLOW_SPAN_RE) ?? [];
      return acc + (i > 0 ? spans[i - 1] : '') + part;
    }, '');
}

/**
 * Brand rule: assistant prose must not carry em dashes. Applied ONLY at
 * display boundaries (SSE, thread reads) — stored text stays untouched, and
 * three prompt-side attempts failed, so this is the render-layer fix.
 */
export function stripEmDashesForDisplay(text: string): string {
  return text.replace(/\s+—\s+/g, ', ').replace(/—/g, '-');
}

/**
 * The mechanical classes the prompt cannot hold (Ticket 11 Task 1): bold
 * markers, markdown headers and em dashes, in the reply and in every button
 * label — applied BEFORE the reply is stored, so `/threads/:id/messages`, the
 * list's `last_message` and the SSE stream all read the same clean text.
 * Four live no-bold instructions were ignored on the 7 Sep build; the render
 * layer is the only place the rule cannot be argued with.
 */
/**
 * Ticket 19 [7]: a line that ends in a colon and is immediately followed by a
 * list. „აი, რამდენიმე ვარიანტი:" above four bullets is the heading habit
 * markdown teaches, and the list underneath already says a list is coming.
 * The colon goes; the sentence stays.
 */
const COLON_BEFORE_LIST = /:[ \t]*(\r?\n[ \t]*(?:[-*•]|\d+[.)])\s)/g;

/** Bold markers and markdown headers — the same in prose and in a label. */
function stripMarkdownMarkers(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '');
}

export function scrubMechanicalForStorage(text: string): string {
  return stripMarkdownMarkers(text)
    .replace(COLON_BEFORE_LIST, '$1')
    .replace(/\s+—\s+/g, ', ')
    .replace(/—/g, '-');
}

/**
 * Ticket 19 [7]. A button label, which is not prose and has to survive
 * different rules from the reply above it.
 *
 * Two differences from the reply scrub.
 *
 * A QUESTION MARK cannot belong in a label: the button is the answer, and a
 * button that asks something is a question with no way to answer it.
 *
 * And an em dash in a label must NOT become a comma. The reply scrub turns
 * „ X — Y " into „X, Y", which is right in prose and wrong here — it
 * manufactures inside a label exactly the comma this item is counting.
 *
 * What is NOT done here, deliberately: commas and hyphens are not stripped.
 * Ninety-five live labels over four days carry nine commas and three
 * hyphens, and reading them one by one is the whole argument —
 * „ნებისმიერი, ვინც საიტის შეკვეთებს ამტკიცებს" needs its comma to be
 * Georgian at all, and the hyphens are all inside words („Archi-ს",
 * „Giorgi-ს"), where removing one leaves a misspelling. A rule that fixes
 * „კონდიციონერი, დამამტკიცე" by breaking the other eight is not a fix.
 * Those are counted instead — see labelCramsTwoThings.
 */
export function scrubButtonLabel(label: string): string {
  return stripMarkdownMarkers(label)
    .replace(/\s+—\s+/g, ' ')
    .replace(/—/g, '-')
    .replace(/\?/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * A label that joined two separate things with a comma — „კონდიციონერი,
 * დამამტკიცე", „გენერალური დირექტორი, Giorgi Turashvili". Counted, not
 * rewritten: the defect is in what wrote the label, and a server that
 * silently repairs it hides how often that happens (the same reasoning as
 * looksLikeTypedChoice).
 *
 * An answer word before the comma („კი, …", „yes, …") is a different shape
 * and a correct one, so it does not count.
 */
const ANSWER_WORD_THEN_COMMA = /^(კი|დიახ|არა|ჰო|yes|no|sure|ok)\s*,/iu;

export function labelCramsTwoThings(label: string): boolean {
  return label.includes(',') && !ANSWER_WORD_THEN_COMMA.test(label.trim());
}

/**
 * A reply that ends by offering alternatives in words („X or Y?", „… თუ …?")
 * while no buttons were attached — the typed-choice class, logged server-side
 * so its size per day is a number, not an impression (Ticket 11 Task 1 (e)).
 */
export function looksLikeTypedChoice(text: string): boolean {
  const lastLine = text.trim().split('\n').pop() ?? '';
  return /\?\s*$/.test(lastLine) && /(\s|,)(or|თუ)\s/i.test(lastLine);
}

/** Reveal allowed spans at a display boundary: drop the markers, keep the content. */
export function stripAllowedSpans(text: string): string {
  return text.split(ALLOW_OPEN).join('').split(ALLOW_CLOSE).join('');
}

// "[hidden]" is plumbing, not prose: tool results reach the model already
// scrubbed, and the model sometimes copies the placeholder into its reply —
// "ილია წულაია ([hidden]): …" rendered to a user (ticket 6 item 13). At the
// display boundary the placeholder disappears entirely, wrapper included:
// a parenthesized/bracketed "( **[hidden]** )" goes as one unit, a bare
// "[hidden]" goes alone, and leftover doubled spaces / space-before-comma are
// tidied. Privacy is unchanged — the number was already gone.
const REDACTED_WRAPPED_RE = /\s*[([]\s*\*{0,2}\[hidden\]\*{0,2}\s*[)\]]/g;
// A QUOTED placeholder goes with its quotes (Ticket 10 Task 3): on 3 Sep the
// reply „ვნახოთ ნომრები: ერთია "[hidden]", მეორე "[hidden]"" reached Lika as
// „ერთია "", მეორე """ — the placeholder gone, the empty quotes left behind to
// be read as a blank number. Straight, Georgian and guillemet quotes alike.
const REDACTED_QUOTED_RE = /\s*["„“'«]\s*\*{0,2}\[hidden\]\*{0,2}\s*["”'»]/g;
const REDACTED_BARE_RE = /\s*\*{0,2}\[hidden\]\*{0,2}/g;
// Ticket 16 Task 47 (Ticket 10 [3.1]): the other road to the same blank. A
// field that is EMPTY — a removed number, an employer nobody filled in — is
// quoted by the model and reaches the screen as „" with nothing inside. The
// tool results no longer carry empty fields (dietToolResult), and anything
// that still slips through loses its quotes here rather than reading as a
// value the user cannot see. A pair with content is never touched.
const EMPTY_QUOTES_RE = /\s*(?:["„“]\s*["”]|'\s*'|«\s*»|\(\s*\))/g;

/**
 * Ticket 20 row 116: the label the number left behind.
 *
 * Removing the number is right; „ნომერი:." is not. Thread 15610 on 16 September
 * showed „ნომერი:." twice, and goal 3466 showed „☎ /" — a label, its colon, and
 * the space where a phone used to be, pulled tight by the tidy-up two lines
 * below. The assistant reads as broken when it is in fact being careful.
 *
 * Exactly the shape of the empty-quotes rule above it, which was written for
 * the same reason on 3 September: the placeholder goes, and whatever was
 * holding its place has to go with it. A label with real content after it is
 * never touched, which the tests state as plainly as the removals.
 */
const CONTACT_LABEL =
  '(?:ნომერი|ნომრები|ტელეფონი|ტელეფონები|ტელ|მობილური|phone|phones|telephone|tel|mob|☎|📞)';

/**
 * Row 116, THIRD shape, and a bug of my own found while fixing it.
 *
 * The labels above are matched as plain substrings, so „tel" matched inside
 * „hotel" and „mob" inside anything containing it. Measured before the fix:
 *
 *   „Grand hotel: [hidden]"  came out  „Grand ho"
 *   „The mob: [hidden]"      came out  „The"
 *
 * That is worse than the artifact the rule was written to remove — it destroys
 * words the user wrote. It shipped with row 116 and it is mine.
 *
 * \b cannot express this: Georgian letters are not word characters in
 * JavaScript, so „\btel" would happily match inside „hotel" anyway in the
 * mixed-script text this product actually produces. A Unicode lookbehind can,
 * and every one of these regexes already carries the `u` flag.
 *
 * The line-anchored rule below does not need it — it is anchored at a line
 * start and cannot slide into the middle of a word — but it costs nothing
 * there and means the two rules cannot drift apart.
 */
const NOT_INSIDE_A_WORD = '(?<![\\p{L}\\p{N}_])';

/**
 * Labels that are ABBREVIATIONS, where a full stop belongs to the LABEL and
 * not to the sentence. This is the tester's third shape, thread 15646:
 *
 *   „floristi.ge, მისამართი N5, თბილისი, ტელ. [hidden]"
 *      came out  „floristi.ge, მისამართი N5, თბილისი, ტელ."
 *
 * „ტელ" was in the list all along; what the inline rule required after it was
 * a separator — a colon, a dash, a slash — and an abbreviating full stop is
 * none of those. Worse, with a sentence-ending stop after the number it came
 * out „ტელ..".
 *
 * Only abbreviations get this, which is the whole point of the split. A full
 * stop after a word written out in full IS the sentence: „მან დაკარგა
 * ტელეფონი." must survive untouched, and it is asserted that it does.
 */
const CONTACT_ABBREVIATION = '(?:ტელ|tel|mob)';

/** The label alone on its line, with nothing left to the end of it. */
const EMPTY_CONTACT_LABEL_RE = new RegExp(
  `(^|\\n)([^\\S\\n]*(?:[-•*]\\s*)?)${NOT_INSIDE_A_WORD}${CONTACT_LABEL}[^\\S\\n]*[:：\\-–—]?[^\\S\\n]*(?:[/,;|][^\\S\\n]*)*[.!?]?(?=[^\\S\\n]*(?:\\n|$))`,
  'giu',
);

/** The same label inside a sentence: „…, ნომერი: ." or „ოთახი 12 ☎ / ". */
const EMPTY_CONTACT_LABEL_INLINE_RE = new RegExp(
  `[,;(]?[^\\S\\n]*${NOT_INSIDE_A_WORD}` +
    // Either a label with a real separator after it, or an abbreviation whose
    // own full stop stands in for one — and that stop may still be followed by
    // a separator („ტელ.:"), which is why this one is optional and the first
    // is not.
    `(?:${CONTACT_LABEL}[^\\S\\n]*[:：\\-–—/]|${CONTACT_ABBREVIATION}\\.[^\\S\\n]*[:：\\-–—/]?)` +
    `[^\\S\\n]*(?:[/,;|][^\\S\\n]*)*(?=[.!?,;)\\n]|$)`,
  'giu',
);

/**
 * Punctuation left touching itself once whatever stood between it is gone.
 *
 * „,." and „, ," are never written by anybody — they only appear where
 * something was removed. The LAST mark wins, because it is the one that ends
 * the sentence: „შეკეთება,." is „შეკეთება.".
 */
const ORPHANED_SEPARATORS_RE = /[,;:/|]+\s*([,.;:!?])/g;

export function stripRedactionArtifactsForDisplay(text: string): string {
  return (
    text
      .replace(REDACTED_WRAPPED_RE, '')
      .replace(REDACTED_QUOTED_RE, '')
      .replace(REDACTED_BARE_RE, '')
      .replace(EMPTY_QUOTES_RE, '')
      // After the placeholder is gone, and before the spacing tidy-up that would
      // otherwise glue „ნომერი:" to the full stop after it.
      // Replaced with NOTHING, not with the captured newline: the line existed
      // only to carry the number, so it goes with it rather than leaving a blank
      // line where a phone used to be.
      .replace(EMPTY_CONTACT_LABEL_RE, '')
      .replace(EMPTY_CONTACT_LABEL_INLINE_RE, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/ {2,}/g, ' ')
      .replace(/ ([,.:;!?])/g, '$1')
      // Ticket 20 row 116, SECOND shape, found by the tester on thread 15646:
      // „ეკრანის შეკეთება [hidden],." came out „ეკრანის შეკეთება,.". The rule
      // above takes a LABEL away with its number; this takes the SEPARATOR that
      // held the number's place when it had no label — a comma and a full stop
      // that sat either side and closed up when the middle vanished.
      .replace(ORPHANED_SEPARATORS_RE, '$1')
  );
}

/**
 * Recursively scrubs a JSON-serializable value: drops phone-named keys,
 * redacts phone-shaped substrings in every string.
 */
export function scrubDeep(value: unknown): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(scrubDeep);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (PHONE_KEY_RE.test(key)) continue;
      out[key] = scrubDeep(entry);
    }
    return out;
  }
  return value;
}

// Private saved emails are masked like phone numbers — but ONLY on contact-data
// reads (profiles, saved facts, insights), never globally: a PUBLIC business
// email arriving from the model's own web search is legitimate to show. Callers
// therefore apply this at the contact-payload source, not at the SSE boundary.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const REDACTED_EMAIL = '[email hidden]';

export function scrubEmailsText(text: string): string {
  return text.replace(EMAIL_RE, REDACTED_EMAIL);
}

/** Recursively masks email addresses in a JSON-serializable value. */
export function scrubEmailsDeep(value: unknown): unknown {
  if (typeof value === 'string') return scrubEmailsText(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(scrubEmailsDeep);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = scrubEmailsDeep(entry);
    }
    return out;
  }
  return value;
}

/** Leak check used by tests and defensive assertions — true if anything phone-like survives. */
export function containsPhoneLike(value: unknown): boolean {
  const serialized = JSON.stringify(value) ?? '';
  const matches = serialized.match(new RegExp(PHONE_LIKE_PATTERN, 'g')) ?? [];
  return matches.some((m) => redactCandidate(m) === REDACTED);
}
