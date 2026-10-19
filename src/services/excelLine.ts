import { tableFromMessage } from './messageTable';
import { RunLanguage } from './runLanguage';

/**
 * D796 / D800 (founder's yes 17 Oct, Misho's yes the same day): the owner asks
 * for a list as Excel, the reply holds the list, and the model says it cannot
 * make an Excel file — „paste it into a spreadsheet" (tester 0 of 3; Lika on
 * her computer). The app already draws an „Excel" button under any reply that
 * lists something, and the server makes the file from the same rows
 * (tableFromMessage). So the refusal goes, and one approved line says where
 * the file is.
 */
export const EXCEL_LINE: Readonly<Partial<Record<RunLanguage, string>>> = {
  ka: 'ქვემოთ „Excel“-ზე დაჭერით ეს სია ფაილად ჩამოიტვირთება.',
  en: 'Tap „Excel“ under this reply to download the list.',
};

/** The files the app offers under a reply (#894 b): Excel, Word, Markdown. */
export enum ReplyFileFormat {
  Excel = 'excel',
  Word = 'word',
  Markdown = 'markdown',
}

/**
 * #6074 (FULL BATTERY 19 Oct, 2 of 2): „my contacts as a Word file" was
 * refused — „I cannot create a Word file here" — and Markdown came back as a
 * code block, while the app draws „Word" and „Markdown" under every reply.
 * The same as Excel: the refusal goes and one line says where the file is.
 */
const FILE_LINE: Readonly<Record<ReplyFileFormat, Readonly<Partial<Record<RunLanguage, string>>>>> =
  {
    [ReplyFileFormat.Excel]: EXCEL_LINE,
    [ReplyFileFormat.Word]: {
      ka: 'ქვემოთ „Word“-ზე დაჭერით ეს სია ფაილად ჩამოიტვირთება.',
      en: 'Tap „Word“ under this reply to download the list.',
    },
    [ReplyFileFormat.Markdown]: {
      ka: 'ქვემოთ „Markdown“-ზე დაჭერით ეს სია ფაილად ჩამოიტვირთება.',
      en: 'Tap „Markdown“ under this reply to download the list.',
    },
  };

const ASKS_FOR_EXCEL_RE = /excel|ექსელ|xlsx|spreadsheet|სპრედშიტ/iu;
const ASKS_FOR_WORD_RE =
  /docx|ვორდ|\bword\b\s*(?:file|doc|document|format|ფაილ|ფორმატ|დოკუმენტ)|\b(?:as|in|into)\s+(?:a\s+)?word\b/iu;
const ASKS_FOR_MARKDOWN_RE = /markdown|მარკდაუნ|\.md\b/iu;
const SPEAKS_OF_A_FILE_RE =
  /excel|ექსელ|xlsx|spreadsheet|ცხრილ|ფაილ|file|sheet|word|ვორდ|docx|document|დოკუმენტ|markdown|მარკდაუნ/iu;
const CANNOT_OR_PASTE_RE =
  /ვერ\s|არ\s+შემიძლია|არ\s+შეიძლება|შეუძლებელ|ჩასვ|ჩააკოპირე|დააკოპირე|გადაიტანე|cannot|can['’]t|can\s+not|unable|not\s+able|paste|copy\s+(?:it|this|the)/iu;
const SENTENCE_RE = /[^.!?…]+[.!?…]*\s*/gu;

/** Did the owner ask for the result as an Excel file? */
export function asksForExcel(ownerLine: string): boolean {
  return ASKS_FOR_EXCEL_RE.test(ownerLine);
}

/** The file the owner asked for the result as, or null when none. */
export function askedFileFormat(ownerLine: string): ReplyFileFormat | null {
  if (asksForExcel(ownerLine)) return ReplyFileFormat.Excel;
  if (ASKS_FOR_WORD_RE.test(ownerLine)) return ReplyFileFormat.Word;
  if (ASKS_FOR_MARKDOWN_RE.test(ownerLine)) return ReplyFileFormat.Markdown;
  return null;
}

function isRefusalSentence(sentence: string): boolean {
  return SPEAKS_OF_A_FILE_RE.test(sentence) && CANNOT_OR_PASTE_RE.test(sentence);
}

/** One prose line with every „cannot make Excel / paste it" sentence taken out. */
function withoutRefusal(line: string): string {
  const sentences = line.match(SENTENCE_RE) ?? [line];
  return sentences
    .filter((s) => !isRefusalSentence(s))
    .join('')
    .trimEnd();
}

const MAX_BARE_ITEM_CHARS = 80;
const MIN_BARE_ITEMS = 2;
const SENTENCE_END_RE = /[.!?…:]\s*$/u;

function isBareItem(line: string): boolean {
  const t = line.trim();
  return t !== '' && t.length <= MAX_BARE_ITEM_CHARS && !SENTENCE_END_RE.test(t);
}

/**
 * #2347 (Lika, 17 Oct): „Excel with three names" came back as three bare
 * lines — „ნინო / გიორგი / ლიკა" — which is no list to the app or the table
 * route, so neither the button nor the line appeared. The first run of two or
 * more short bare lines becomes a bulleted list.
 */
export function withBareLinesAsList(reply: string): string {
  const lines = reply.split('\n');
  const start = lines.findIndex(
    (l, i) => isBareItem(l) && lines.slice(i, i + MIN_BARE_ITEMS).every(isBareItem),
  );
  if (start === -1) return reply;
  let end = start;
  while (end < lines.length && isBareItem(lines[end])) end += 1;
  return [
    ...lines.slice(0, start),
    ...lines.slice(start, end).map((l) => `- ${l.trim()}`),
    ...lines.slice(end),
  ].join('\n');
}

/** The lines of a reply that are items of its list or rows of its table. */
function listLinesOf(reply: string): string[] {
  return reply.split('\n').filter((l) => tableFromMessage(`${l}\n${l}`) !== null);
}

/**
 * #2347 retest (tester 18 Oct, thread 58808): „give me the result as Excel" got
 * „I cannot make an Excel file here; the list is ready, copy it" — and no list,
 * because the list was the reply before. With no list in this reply there was
 * nothing to draw a button under and nothing to make the file from. When the
 * owner asks for Excel, this reply lists nothing, and the reply before it did,
 * that list is carried into this one, so `withExcelLine` can say where the file
 * is. The refusal sentences go; anything else the reply said stays above it.
 */
export function withEarlierListForAFile(
  given: string,
  earlierReply: string | null,
  ownerLine: string,
): string {
  if (askedFileFormat(ownerLine) === null || earlierReply === null) return given;
  if (tableFromMessage(withBareLinesAsList(given)) !== null) return given;
  const earlierList = listLinesOf(earlierReply);
  if (tableFromMessage(earlierList.join('\n')) === null) return given;
  const kept = given
    .split('\n')
    .map(withoutRefusal)
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
  return kept === '' ? earlierList.join('\n') : `${kept}\n\n${earlierList.join('\n')}`;
}

/** A ```markdown … ``` block with its fences taken off: the list inside is the reply. */
export function withoutCodeFences(reply: string): string {
  return reply.replace(/^```[a-z]*\s*$\n?/gimu, '').trim();
}

/**
 * The reply with the refusal replaced by the line, when the owner asked for a
 * file and the reply holds a list. Lines of the list itself are left alone.
 */
export function withFileLine(given: string, ownerLine: string, language: RunLanguage): string {
  const format = askedFileFormat(ownerLine);
  const line = format === null ? undefined : FILE_LINE[format][language];
  if (line === undefined) return given;
  const unfenced = withoutCodeFences(given);
  const reply = tableFromMessage(unfenced) === null ? withBareLinesAsList(unfenced) : unfenced;
  if (tableFromMessage(reply) === null) return given;
  if (reply.includes(line)) return reply;
  const kept = reply
    .split('\n')
    .map((l) => (tableFromMessage(`${l}\n${l}`) === null ? withoutRefusal(l) : l))
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trimEnd();
  return `${kept}\n\n${line}`;
}

/**
 * #6074 retest (the tester's 68835, 60506): „my contacts as a Word file" in a new
 * conversation — the run called list_my_contacts, then wrote „I can't make a
 * downloadable Word file, I can lay it out as text" and no list. Nothing in the
 * reply, and no reply before it, to draw the file from. The names that run's own
 * list returned are that list: the owner's own saved names, never a number.
 */
export function listedNames(listed: {
  readonly contacts: ReadonlyArray<{ readonly name: string | null }>;
}): string[] {
  return listed.contacts.map((contact) => contact.name?.trim() ?? '').filter((name) => name !== '');
}

/** The names as a reply that lists them; null when there are none. */
export function contactsAsList(names: readonly string[]): string | null {
  return names.length === 0 ? null : names.map((name) => `- ${name}`).join('\n');
}
