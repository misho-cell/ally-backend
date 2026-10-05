import { query } from '../db/postgres/client';
import { nameKey } from './tools/transliterate';
import { getExcludedPhoneSet } from './block.service';
import { normalizePhone } from './phone';
import { ALLOW_CLOSE, ALLOW_OPEN } from './privacyScrub';
import { sendApprovedAskAnswer } from './taskAsks.service';

/**
 * Board #991 (the founder, 4 October): „NetAI is not giving out numbers, but if
 * I am going to share a number that I have in my phone book with someone, that
 * is not a problem."
 *
 * When the OWNER's own latest typed line, in a question someone asked him,
 * names a contact from HIS phonebook and says to give the number, the server
 * passes that one number to the person who asked. Everything that makes it
 * safe is checked here, not asked of the model:
 *
 *   - a live question in this thread, asked of this owner;
 *   - the contact is in this owner's own phonebook and not excluded;
 *   - his own latest typed line names that contact and speaks of a number.
 *
 * Never on Netai's own initiative, never from another phonebook, never without
 * those words. The number travels inside the allow markers, so the screens
 * reveal it and every other number stays scrubbed.
 */
const SHARE_QUERY_TIMEOUT_MS = 5_000;
const NUMBER_WORD_RE = /(ნომერ|ტელეფონ|number|phone|номер|телефон|número|teléfono)/iu;
/** A Georgian name in a sentence takes a case ending: „დათოს", „ნინოს", „გიორგის". */
const GEORGIAN_NOMINATIVE_END_RE = /[ია]$/u;

export enum ShareRefusal {
  NoLiveQuestion = 'no_live_question',
  NotOwnContact = 'not_own_contact',
  NotTheOwnersWord = 'not_the_owners_word',
}

export type ShareOutcome =
  | { readonly shared: true; readonly name: string }
  | { readonly shared: false; readonly reason: ShareRefusal };

/** The stem a name keeps in a sentence: „დათო" → „დათ", „Dato" → „dato". */
function nameStem(word: string): string {
  const lower = word.toLowerCase();
  return lower.length > 3 && GEORGIAN_NOMINATIVE_END_RE.test(lower) ? lower.slice(0, -1) : lower;
}

/**
 * The tester's 39604 (#991): the helper saved „Gia Dantisti" in Latin letters
 * and typed „გაუგზავნე ლევანს გია დანტისტის ნომერი" in Georgian — refused three
 * times, because the name was looked for in one script only. Both sides are
 * also compared in Latin letters.
 */
const LATIN_NOMINATIVE_END_RE = /[ia]$/u;

/** The name's key without its nominative ending: „Vaja" → „vaj", „ვაჟა" → „vaj". */
function latinStem(word: string): string {
  const key = nameKey(word);
  return key.length > 3 && LATIN_NOMINATIVE_END_RE.test(key) ? key.slice(0, -1) : key;
}

/** Does the owner's own line name this contact and speak of a number? */
export function ownerLineSharesNumber(line: string, alias: string): boolean {
  if (!NUMBER_WORD_RE.test(line)) return false;
  const first = alias.trim().split(/\s+/u)[0] ?? '';
  if (first.length < 2) return false;
  const lower = line.toLowerCase();
  return lower.includes(nameStem(first)) || nameKey(lower).includes(latinStem(first));
}

/**
 * „კი" to Netai's own „shall I send <name>'s number?" — the yes to a question
 * the owner's earlier line had already asked for. A bare yes alone never is.
 */
const BARE_YES_RE =
  /^\s*(კი|ki|ho|yes|yeah|ok|okay|да|sí|si|გაუგზავნე|გააგზავნე|send it)[\s.!,)]*$/iu;

/** The tap on one of several same-named contacts: „პირველი", „2", „the second". */
const ORDINAL_PICK_RE =
  /^\s*(?:the\s+)?(1|2|3|პირველი|მეორე|მესამე|first|second|third|первый|второй|третий|primero|segundo|tercero)[\s.!,)]*$/iu;

/** A word that takes the instruction back or puts it on hold. */
const HOLD_RE =
  /(?:^|[\s,.!?])(არა|არ|ნუ|მოიცა|გააუქმე|no|not|don'?t|stop|wait|cancel|нет|не|стоп|подожди|отмена|espera|cancela)(?=$|[\s,.!?])/iu;

/** A pick is a short line; a longer one is a new message, not a tap. */
const PICK_MAX_CHARS = 80;

/**
 * Tester 39832 (#1519): two contacts shared the name, Netai offered both, she
 * tapped one — refused, because her latest line was the pick and not the
 * instruction; then her „კი" to the re-ask was refused too, and she was told
 * to retype the whole sentence. Her first typed line was the yes (D316/D625).
 * So a pick of the contact, or a bare yes, carries the instruction before it.
 */
function continuesTheInstruction(line: string, alias: string): boolean {
  if (BARE_YES_RE.test(line) || ORDINAL_PICK_RE.test(line)) return true;
  if (line.length > PICK_MAX_CHARS || HOLD_RE.test(line)) return false;
  const first = alias.trim().split(/\s+/u)[0] ?? '';
  if (first.length < 2) return false;
  const lower = line.toLowerCase();
  return lower.includes(nameStem(first)) || nameKey(lower).includes(latinStem(first));
}

/**
 * The owner's lines, newest first: the newest that names the contact and a
 * number is the instruction, and every line after it must only continue it.
 */
export function ownerLinesShareNumber(latestFirst: readonly string[], alias: string): boolean {
  for (const line of latestFirst) {
    if (ownerLineSharesNumber(line, alias)) return true;
    if (!continuesTheInstruction(line, alias)) return false;
  }
  return false;
}

interface LiveAsk {
  readonly id: number;
}

async function liveAskFor(ownerId: string, askThreadId: number): Promise<LiveAsk | null> {
  const result = await query<LiveAsk>(
    `SELECT id FROM task_asks
      WHERE ask_thread_id = $1 AND to_user_id = $2::int AND status IN ('sent', 'answered')
      ORDER BY id DESC LIMIT 1`,
    [askThreadId, ownerId],
    SHARE_QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

async function ownContactAlias(ownerId: string, phone: string): Promise<string | null> {
  const [own, excluded] = await Promise.all([
    query<{ alias: string }>(
      'SELECT alias FROM "UserAlias" WHERE "contactId" = $1 AND phone = $2 LIMIT 1',
      [ownerId, phone],
      SHARE_QUERY_TIMEOUT_MS,
    ),
    getExcludedPhoneSet(ownerId),
  ]);
  if (excluded.has(normalizePhone(phone))) return null;
  return own.rows[0]?.alias ?? null;
}

/** The instruction, the pick of a same-named contact, the yes to Netai's re-ask. */
const OWNER_LINES_READ = 3;

/** The owner's own last three lines in this conversation, newest first. */
async function ownersLatestLines(askThreadId: number): Promise<string[]> {
  const result = await query<{ content: string }>(
    `SELECT content FROM conversations
      WHERE thread_id = $1 AND role = 'user' AND kind = 'message' AND TRIM(content) <> ''
      ORDER BY created_at DESC LIMIT $2`,
    [askThreadId, OWNER_LINES_READ],
    SHARE_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((row) => row.content);
}

export async function shareContactNumberWithAsker(
  ownerId: string,
  askThreadId: number,
  phoneRaw: string,
): Promise<ShareOutcome> {
  const phone = phoneRaw.trim();
  if ((await liveAskFor(ownerId, askThreadId)) === null) {
    return { shared: false, reason: ShareRefusal.NoLiveQuestion };
  }
  const alias = phone === '' ? null : await ownContactAlias(ownerId, phone);
  if (alias === null) return { shared: false, reason: ShareRefusal.NotOwnContact };
  if (!ownerLinesShareNumber(await ownersLatestLines(askThreadId), alias)) {
    return { shared: false, reason: ShareRefusal.NotTheOwnersWord };
  }
  const text = `${alias}: ${ALLOW_OPEN}${phone}${ALLOW_CLOSE}`;
  const sent = await sendApprovedAskAnswer(ownerId, askThreadId, text, { verbatim: true });
  return sent.sent
    ? { shared: true, name: alias }
    : { shared: false, reason: ShareRefusal.NoLiveQuestion };
}
