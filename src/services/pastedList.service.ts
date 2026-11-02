import { parseListFile } from './listFile';
import { fileEventText, saveThreadFile } from './threadFiles.service';
import { saveThreadMessage } from './threads.service';

/**
 * #8522 (the tester's 80752 item 8, case 128): a list of 30 companies pasted
 * into the chat as CSV text was searched one company at a time — 53 calls, 44
 * of them refused by the run's search budget. work_the_list, which looks up
 * every row's way in at once and outside that budget, reads only a FILE. So a
 * pasted table is kept as the conversation's file, exactly as an upload is, and
 * the run sees the same file event.
 */
export const MIN_PASTED_ROWS = 10;
const PASTED_FILENAME = 'pasted-list.csv';
const ROW_RE = /^[^,\n]+(?:,[^,\n]*)+$/u;

/** A line that introduces what follows („აი ჩემი სია, 30 კომპანია (CSV):") is not a row. */
const INTRO_LINE_RE = /:\s*$/u;

function commasIn(line: string): number {
  return line.split(',').length - 1;
}

/** The longest run of lines with the same number of commas, when it is long enough to be a list. */
export function pastedTable(message: string): string | null {
  let best: string[] = [];
  let current: string[] = [];
  for (const raw of message.split('\n')) {
    const line = raw.trim();
    const isRow = ROW_RE.test(line) && !INTRO_LINE_RE.test(line);
    const sameShape = current.length > 0 && commasIn(current[0] ?? '') === commasIn(line);
    if (isRow && (current.length === 0 || sameShape)) {
      current.push(line);
    } else {
      current = isRow ? [line] : [];
    }
    if (current.length > best.length) best = current;
  }
  // The first line of the run is read as the header, as in an uploaded CSV.
  return best.length > MIN_PASTED_ROWS ? best.join('\n') : null;
}

/** Keeps a pasted table as this conversation's file; the file's id, or null when there is none. */
export async function keepPastedList(
  threadId: number,
  userId: number,
  message: string,
): Promise<number | null> {
  const table = pastedTable(message);
  if (table === null) return null;
  const buffer = Buffer.from(table, 'utf8');
  const outcome = await parseListFile(buffer, PASTED_FILENAME);
  if (!outcome.ok || outcome.file.rows.length < MIN_PASTED_ROWS) return null;
  const stored = await saveThreadFile(
    threadId,
    userId,
    PASTED_FILENAME,
    buffer.length,
    outcome.file,
  );
  await saveThreadMessage(
    threadId,
    userId,
    'user',
    fileEventText(stored.id, PASTED_FILENAME, outcome.file),
    'event',
  );
  return stored.id;
}
