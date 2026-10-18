import { Request, Response, Router } from 'express';
import {
  EmptyVcfError,
  isUploadLinkOpen,
  UPLOAD_PATH,
  UploadLinkClosedError,
  startUploadThroughLink,
} from '../../services/contactUploadLinks.service';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { renderClosedPage, renderUploadPage } from './contactUploadPage';

/**
 * #5744 (A): the one-time contacts-upload link a connector tool hands out. The
 * token in the path is the only key; it is one use and short-lived. The body
 * arrives through the app-wide JSON parser (10 MB).
 */
const WINDOW_MS = 5 * 60_000;
const MAX_REQUESTS = 30;
const MAX_VCF_CHARS = 5_000_000;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/u;

const contactUploadRouter = Router();
contactUploadRouter.use(rateLimit({ windowMs: WINDOW_MS, max: MAX_REQUESTS }));

contactUploadRouter.get('/:token', async (req: Request, res: Response): Promise<void> => {
  try {
    const token = String(req.params.token);
    res.setHeader('Cache-Control', 'no-store');
    if (!TOKEN_RE.test(token) || !(await isUploadLinkOpen(token))) {
      res.status(410).send(renderClosedPage());
      return;
    }
    res.status(200).send(renderUploadPage(`${UPLOAD_PATH}/${token}`));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[contact-upload] page failed:', (err as Error).message);
    res.status(500).send(renderClosedPage());
  }
});

contactUploadRouter.post('/:token', async (req: Request, res: Response): Promise<void> => {
  const token = String(req.params.token);
  const vcf = (req.body as { vcfContent?: unknown } | undefined)?.vcfContent;
  if (
    !TOKEN_RE.test(token) ||
    typeof vcf !== 'string' ||
    vcf.trim() === '' ||
    vcf.length > MAX_VCF_CHARS
  ) {
    res
      .status(400)
      .json({ success: false, error: 'ფაილი ვერ წავიკითხე · The file could not be read' });
    return;
  }
  try {
    const started = await startUploadThroughLink(token, vcf);
    // Answered at once; the contacts load in the background (the tester's 67194).
    res.status(202).json({ success: true, data: { inFile: started.inFile, loading: true } });
  } catch (err) {
    if (err instanceof UploadLinkClosedError) {
      res
        .status(410)
        .json({ success: false, error: 'ბმული აღარ მოქმედებს · This link no longer works' });
      return;
    }
    if (err instanceof EmptyVcfError) {
      res
        .status(400)
        .json({ success: false, error: 'ფაილში კონტაქტი ვერ ვიპოვე · No contacts in the file' });
      return;
    }
    // eslint-disable-next-line no-console
    console.error('[contact-upload] import failed:', (err as Error).message);
    res
      .status(500)
      .json({ success: false, error: 'ვერ აიტვირთა, სცადე თავიდან · Upload failed, try again' });
  }
});

export default contactUploadRouter;
