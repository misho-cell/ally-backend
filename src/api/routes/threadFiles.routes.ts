import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { param, validationResult } from 'express-validator';

import {
  authenticateJwt,
  requireUserRole,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { ApiResponse } from '../../types';
import {
  ListFileRefusal,
  listFileRefusal,
  listFileSummary,
  MAX_FILE_BYTES,
  ParsedListFile,
  parseListFile,
} from '../../services/listFile';
import { fileEventText, saveThreadFile } from '../../services/threadFiles.service';
import {
  ATTACHMENT_MARK,
  getThread,
  nameUntitledThreadFromFile,
  saveServerLine,
  saveThreadMessage,
  threadLanguage,
} from '../../services/threads.service';
import { RunLanguage } from '../../services/runLanguage';
import { emitThreadUpdated } from '../../services/sse.service';
import { listWorkbook } from '../../services/listItems.service';
import { getTaskById } from '../../services/taskStore.service';

/**
 * Board #892 (the founder, 4 October): the owner gives Netai a file.
 *
 *   POST /thread-files/:id   multipart, one field „file" (:id is the conversation)
 *
 * The file is read (listFile.ts), kept with this conversation (#895: the
 * owner's own, deleted with it), and answered with one line of what was
 * understood. Its content reaches the model as a server event in this
 * conversation's history, framed as the owner's data and never an
 * instruction. Nothing is sent to anyone and nothing is added to contacts.
 */
const threadFilesRouter = Router();
threadFilesRouter.use(authenticateJwt, requireUserRole);
/** A file is read in memory and parsed; a runaway client stays a small load. */
threadFilesRouter.use(rateLimit({ windowMs: 60_000, max: 10 }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 4 },
});

const MAX_FILENAME_CHARS = 120;

/**
 * Multer hands the name over as Latin-1, so a Georgian file name arrives as
 * mojibake. Read back as UTF-8, bounded, and stripped of any path.
 */
export function uploadedFileName(raw: string): string {
  const utf8 = Buffer.from(raw, 'latin1').toString('utf8');
  const base = utf8.split(/[\\/]/u).pop() ?? '';
  return base.trim().slice(0, MAX_FILENAME_CHARS) || 'file';
}

async function languageOf(threadId: number): Promise<RunLanguage> {
  return threadLanguage(threadId).catch(() => 'ka' as RunLanguage);
}

/** A body over the ceiling is refused by multer before the handler; said plainly. */
function acceptOneFile(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    const tooBig = (err as { code?: string }).code === 'LIMIT_FILE_SIZE';
    void languageOf(Number(req.params.id)).then((language) => {
      res.status(tooBig ? 413 : 400).json({
        success: false,
        error: tooBig
          ? listFileRefusal(ListFileRefusal.TooLarge, language)
          : listFileRefusal(ListFileRefusal.Unreadable, language),
      });
    });
  });
}

interface UploadedFile {
  readonly threadId: number;
  readonly owner: number;
  readonly filename: string;
  readonly byteSize: number;
  readonly language: RunLanguage;
}

/** Store the read file, put it in the conversation, and answer with one line. */
async function keepAndAnswer(
  up: UploadedFile,
  file: ParsedListFile,
): Promise<Record<string, unknown>> {
  const stored = await saveThreadFile(up.threadId, up.owner, up.filename, up.byteSize, file);
  await saveThreadMessage(up.threadId, up.owner, 'user', `${ATTACHMENT_MARK} ${up.filename}`);
  await saveThreadMessage(
    up.threadId,
    up.owner,
    'user',
    fileEventText(stored.id, up.filename, file),
    'event',
  );
  const title = await nameUntitledThreadFromFile(up.threadId, up.filename).catch(() => null);
  if (title !== null) emitThreadUpdated(String(up.owner), { id: up.threadId, title });
  const summary = listFileSummary(file, up.language);
  const line = await saveServerLine(up.threadId, up.owner, summary);
  return {
    fileId: stored.id,
    filename: up.filename,
    summary,
    messageId: String(line.id),
    createdAt: line.createdAt,
  };
}

threadFilesRouter.post(
  '/:id',
  param('id').isInt({ min: 1 }),
  acceptOneFile,
  async (req: Request, res: Response<ApiResponse<unknown>>): Promise<void> => {
    if (!validationResult(req).isEmpty()) {
      res.status(400).json({ success: false, error: 'არასწორი საუბრის id' });
      return;
    }
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const threadId = Number(req.params.id);
      if ((await getThread(threadId, userId)) === null) {
        res.status(404).json({ success: false, error: 'საუბარი ვერ მოიძებნა' });
        return;
      }
      const language = await languageOf(threadId);
      const upload = req.file;
      const filename = uploadedFileName(upload?.originalname ?? '');
      const outcome =
        upload === undefined
          ? ({ ok: false, reason: ListFileRefusal.Empty } as const)
          : await parseListFile(upload.buffer, filename);
      if (!outcome.ok) {
        res.status(400).json({ success: false, error: listFileRefusal(outcome.reason, language) });
        return;
      }
      const up = {
        threadId,
        owner: Number(userId),
        filename,
        byteSize: upload?.size ?? 0,
        language,
      };
      res.status(201).json({ success: true, data: await keepAndAnswer(up, outcome.file) });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[POST /thread-files/:id]', (error as Error).message);
      res.status(500).json({ success: false, error: 'ფაილის შენახვა ვერ მოხერხდა' });
    }
  },
);

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const NO_LIST_ON_GOAL = 'ამ მიზანს სია არ აქვს';

/**
 * Board #894: the worked list back as Excel — the owner's columns, then the
 * way in, through whom and where each row stands. Only the goal's owner gets it.
 *
 *   GET /thread-files/goals/:taskId/list.xlsx
 */
threadFilesRouter.get(
  '/goals/:taskId/list.xlsx',
  param('taskId').isInt({ min: 1 }),
  async (req: Request, res: Response): Promise<void> => {
    if (!validationResult(req).isEmpty()) {
      res.status(400).json({ success: false, error: 'არასწორი მიზნის id' });
      return;
    }
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const taskId = Number(req.params.taskId);
      const task = await getTaskById(taskId);
      const language = task?.thread_id != null ? await languageOf(task.thread_id) : 'ka';
      const book = await listWorkbook(userId, taskId, language);
      if (book === null) {
        res.status(404).json({ success: false, error: NO_LIST_ON_GOAL });
        return;
      }
      res.setHeader('Content-Type', XLSX_TYPE);
      res.setHeader('Content-Disposition', `attachment; filename="netai-list-${taskId}.xlsx"`);
      res.status(200).send(book);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[GET /thread-files/goals/:taskId/list.xlsx]', (error as Error).message);
      res.status(500).json({ success: false, error: 'სიის ჩამოტვირთვა ვერ მოხერხდა' });
    }
  },
);

export default threadFilesRouter;
