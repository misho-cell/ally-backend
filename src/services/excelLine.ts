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

const ASKS_FOR_EXCEL_RE = /excel|ექსელ|xlsx|spreadsheet|სპრედშიტ/iu;
const SPEAKS_OF_A_FILE_RE = /excel|ექსელ|xlsx|spreadsheet|ცხრილ|ფაილ|file|sheet/iu;
const CANNOT_OR_PASTE_RE =
  /ვერ\s|არ\s+შემიძლია|არ\s+შეიძლება|შეუძლებელ|ჩასვი|ჩააკოპირე|დააკოპირე|გადაიტანე|cannot|can['’]t|can\s+not|unable|not\s+able|paste|copy\s+(?:it|this|the)/iu;
const SENTENCE_RE = /[^.!?…]+[.!?…]*\s*/gu;

/** Did the owner ask for the result as an Excel file? */
export function asksForExcel(ownerLine: string): boolean {
  return ASKS_FOR_EXCEL_RE.test(ownerLine);
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

/**
 * The reply with the refusal replaced by the line, when the owner asked for
 * Excel and the reply holds a list. Lines of the list itself are left alone.
 */
export function withExcelLine(given: string, ownerLine: string, language: RunLanguage): string {
  const line = EXCEL_LINE[language];
  if (line === undefined || !asksForExcel(ownerLine)) return given;
  const reply = tableFromMessage(given) === null ? withBareLinesAsList(given) : given;
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
