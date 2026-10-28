import ExcelJS from 'exceljs';
import { query } from '../db/postgres/client';

/**
 * #8317 (desk C-32c, founder's priority 1): the admin could not see or download
 * a file a member uploaded. A user's uploads are listed, and one comes back as
 * it was sent. A file stored before the upload itself was kept (migration 282)
 * comes back rebuilt from what was read — the one sheet, the rows kept — and
 * says so in `X-Netai-Rebuilt`, never passing for the original.
 */
const QUERY_TIMEOUT_MS = 8_000;
export const MAX_FILES_LISTED = 50;
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const TEXT_TYPE = 'text/plain; charset=utf-8';
const OCTET_TYPE = 'application/octet-stream';
const REBUILT_SHEET = 'Netai (rebuilt)';
const EXTENSION_RE = /\.[^.]+$/u;

export interface UserFileRow {
  readonly id: number;
  readonly filename: string;
  readonly thread_id: number;
  readonly kind: string;
  readonly byte_size: number;
  readonly created_at: string;
  readonly has_original: boolean;
}

export interface AdminFile {
  readonly filename: string;
  readonly mimeType: string;
  readonly body: Buffer;
  readonly rebuilt: boolean;
}

interface StoredFileRow {
  readonly filename: string;
  readonly kind: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly text_content: string;
  readonly original: Buffer | null;
  readonly mime_type: string | null;
}

/** One user's uploads, newest first. */
export async function userFiles(userId: number): Promise<UserFileRow[]> {
  const result = await query<UserFileRow>(
    `SELECT id, filename, thread_id, kind, byte_size,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            original IS NOT NULL AS has_original
       FROM thread_files WHERE user_id = $1
      ORDER BY created_at DESC LIMIT $2`,
    [userId, MAX_FILES_LISTED],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** A table read from the file, back as a one-sheet workbook. */
async function rebuiltWorkbook(row: StoredFileRow): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(REBUILT_SHEET);
  if (row.columns.length > 0) sheet.addRow([...row.columns]);
  for (const cells of row.rows) sheet.addRow([...cells]);
  return Buffer.from(await book.xlsx.writeBuffer());
}

async function rebuilt(row: StoredFileRow): Promise<AdminFile> {
  const base = row.filename.replace(EXTENSION_RE, '');
  if (row.columns.length > 0 || row.rows.length > 0) {
    return {
      filename: `${base} (rebuilt).xlsx`,
      mimeType: XLSX_TYPE,
      body: await rebuiltWorkbook(row),
      rebuilt: true,
    };
  }
  return {
    filename: `${base} (rebuilt).txt`,
    mimeType: TEXT_TYPE,
    body: Buffer.from(row.text_content, 'utf8'),
    rebuilt: true,
  };
}

/** The upload as sent, or rebuilt from what was read when only that was kept; null when none. */
export async function fileForAdmin(fileId: number): Promise<AdminFile | null> {
  const result = await query<StoredFileRow>(
    `SELECT filename, kind, columns, rows, text_content, original, mime_type
       FROM thread_files WHERE id = $1 LIMIT 1`,
    [fileId],
    QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  if (row.original !== null) {
    return {
      filename: row.filename,
      mimeType: row.mime_type ?? OCTET_TYPE,
      body: row.original,
      rebuilt: false,
    };
  }
  return rebuilt(row);
}
