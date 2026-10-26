import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import {
  authenticateJwt,
  requireUserRole,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { requireSubscription } from '../middleware/subscription.middleware';
import { importContacts, parseVcf } from '../../services/contacts.service';
import {
  CARD_MEDIA_TYPES,
  CardMediaType,
  MAX_CARD_BASE64_CHARS,
  readBusinessCard,
} from '../../services/businessCard.service';
import {
  contactImportState,
  setContactImportReminder,
} from '../../services/contactImportState.service';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { contactPage, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../services/contactBook.service';
import {
  contactPageFor,
  ownContactPhone,
  ownFacts,
  Warmth,
} from '../../services/contactPage.service';
import {
  addOwnLabel,
  excludeFromGoal,
  MAX_OWN_LABEL_CHARS,
  removeOwnLabel,
  setOwnWarmth,
} from '../../services/contactOwnerSettings.service';
import {
  addOwnFact,
  correctOwnFact,
  EditOutcome,
  forgetOwnFact,
  markDeceased,
  MAX_FACT_CHARS,
  removeFromNetwork,
  removeOwnExclusion,
} from '../../services/contactEdits.service';
import { ApiResponse, ImportResult } from '../../types';
import { getSession } from '../../db/neo4j/client';
import pool from '../../db/postgres/client';

const contactsRouter = Router();

contactsRouter.use(authenticateJwt, requireUserRole);
contactsRouter.use(requireSubscription);

/** The import-state routes are read on every visit to the sync page. */
const IMPORT_STATE_PER_MINUTE = 30;
const importStateLimit = rateLimit({ windowMs: 60_000, max: IMPORT_STATE_PER_MINUTE });

/**
 * The frontend's 06:30Z item 7 (the contact sync page):
 *   GET /contacts/import-state  { last_import_at, last_import_count, count, monthly_reminder }
 *   PUT /contacts/import-state  { monthly_reminder: boolean }
 */
contactsRouter.get('/import-state', importStateLimit, async (req: Request, res: Response) => {
  try {
    const userId = Number((req as AuthenticatedRequest).user.userId);
    res.status(200).json({ success: true, data: await contactImportState(userId) });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /contacts/import-state]', (error as Error).message);
    res.status(500).json({ success: false, error: 'Could not read the import state' });
  }
});

contactsRouter.put('/import-state', importStateLimit, async (req: Request, res: Response) => {
  const on = (req.body as { monthly_reminder?: unknown } | undefined)?.monthly_reminder;
  if (typeof on !== 'boolean') {
    res.status(400).json({ success: false, error: 'monthly_reminder must be true or false' });
    return;
  }
  try {
    const userId = Number((req as AuthenticatedRequest).user.userId);
    await setContactImportReminder(userId, on);
    res.status(200).json({ success: true, data: await contactImportState(userId) });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[PUT /contacts/import-state]', (error as Error).message);
    res.status(500).json({ success: false, error: 'Could not save the reminder' });
  }
});

contactsRouter.post(
  '/import',
  body('contacts')
    .isArray({ min: 1, max: 500 })
    .withMessage('contacts must be an array of 1–500 items'),
  body('contacts.*.name').isString().trim().notEmpty().withMessage('each contact must have a name'),
  body('contacts.*.phones')
    .isArray({ min: 1 })
    .withMessage('each contact must have at least one phone'),
  body('contacts.*.phones.*').isString().withMessage('phone must be a string'),
  body('contacts.*.email').optional().isString(),
  body('contacts.*.employer').optional().isString(),
  body('contacts.*.jobPosition').optional().isString(),
  body('contacts.*.city').optional().isString(),
  async (req: Request, res: Response<ApiResponse<ImportResult>>) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const message = errors
        .array()
        .map((e) => e.msg)
        .join(', ');
      res.status(400).json({ success: false, error: message });
      return;
    }

    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const { contacts } = req.body as {
        contacts: Array<{
          name: string;
          phones: string[];
          email?: string;
          employer?: string;
          jobPosition?: string;
          city?: string;
        }>;
      };
      const result = await importContacts(userId, contacts);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'კონტაქტების იმპორტი ვერ მოხერხდა';
      res.status(400).json({ success: false, error: message });
    }
  },
);

const CARD_READS_PER_MINUTE = 10;
const cardReadLimit = rateLimit({ windowMs: 60_000, max: CARD_READS_PER_MINUTE });

/**
 * #374 way 3: a business card photo read into one contact, not saved — the app
 * shows it for a check and saves it with POST /contacts/import.
 *   POST /contacts/card-read { image: base64, media_type: image/jpeg|png|webp }
 *   200 { name, phones[], email?, employer?, jobPosition?, city? } · 400 bad image
 *   422 no name or number on the card · 500 the read failed
 */
contactsRouter.post(
  '/card-read',
  cardReadLimit,
  body('image').isString().isLength({ min: 1, max: MAX_CARD_BASE64_CHARS }),
  body('media_type').isIn([...CARD_MEDIA_TYPES]),
  async (req: Request, res: Response) => {
    if (!validationResult(req).isEmpty()) {
      res.status(400).json({
        success: false,
        error: 'Send image (base64, up to about 5 MB) and media_type (image/jpeg, png or webp).',
      });
      return;
    }
    try {
      const { image, media_type: mediaType } = req.body as {
        image: string;
        media_type: CardMediaType;
      };
      const userId = (req as AuthenticatedRequest).user.userId;
      const contact = await readBusinessCard(image, mediaType, userId);
      if (contact === null) {
        res.status(422).json({ success: false, error: 'ბარათზე სახელი ან ნომერი ვერ ამოვიკითხე.' });
        return;
      }
      res.status(200).json({ success: true, data: contact });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[card-read]', (error as Error).message);
      res.status(500).json({ success: false, error: 'ბარათი ვერ წავიკითხე — სცადე ხელახლა.' });
    }
  },
);

contactsRouter.post(
  '/import-vcf',
  body('vcfContent')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('vcfContent is required')
    .isLength({ max: 5_000_000 })
    .withMessage('vcfContent must be under 5 MB'),
  async (req: Request, res: Response<ApiResponse<ImportResult>>) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const message = errors
        .array()
        .map((e) => e.msg)
        .join(', ');
      res.status(400).json({ success: false, error: message });
      return;
    }

    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const { vcfContent } = req.body as { vcfContent: string };
      const contacts = parseVcf(vcfContent);
      if (contacts.length === 0) {
        res.status(400).json({ success: false, error: 'vCard ფაილი კონტაქტებს არ შეიცავს' });
        return;
      }
      const result = await importContacts(userId, contacts, 'vcf_import');
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'vCard იმპორტი ვერ მოხერხდა';
      res.status(400).json({ success: false, error: message });
    }
  },
);

// Blocking itself goes through the agent (block_contact). The list and
// unblocking are also REST since #505: GET /profile/blocked and
// DELETE /profile/blocked/:ref, under /profile so they need no subscription.

const MAX_FRIEND_PHONES_DIAG = 3000;

contactsRouter.get('/diag/second-degree', async (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).user.userId;
  const tagQuery = String(req.query['q'] ?? 'test');

  const t0 = Date.now();

  const phoneResult = await pool.query<{ phone: string }>(
    'SELECT phone FROM "UserPhone" WHERE "userId" = $1 LIMIT 1',
    [userId],
  );
  if (phoneResult.rows.length === 0) {
    res.status(404).json({ success: false, error: 'Phone not found for user' });
    return;
  }
  const userPhone = phoneResult.rows[0].phone;

  const neo4jSession = getSession();
  let friendPhones: string[] = [];
  try {
    const neo4jResult = await neo4jSession.run(
      `MATCH (me:AllyNode {phoneKey: $userPhone})-[:CONTACT]->(friend:AllyNode)
       RETURN DISTINCT friend.phoneKey AS phoneKey
       LIMIT ${MAX_FRIEND_PHONES_DIAG}`,
      { userPhone },
      { timeout: 10000 },
    );
    friendPhones = neo4jResult.records
      .map((r) => r.get('phoneKey') as string | null)
      .filter((p): p is string => p !== null);
  } finally {
    await neo4jSession.close();
  }

  const t1 = Date.now();

  const registeredResult = await pool.query<{ userId: string; phone: string }>(
    'SELECT "userId", phone FROM "UserPhone" WHERE phone = ANY($1)',
    [friendPhones],
  );
  const registeredFriends = registeredResult.rows;

  const t2 = Date.now();

  const exactTerm = tagQuery.toLowerCase();
  const likeTerm = '%' + exactTerm + '%';

  let pgRows: unknown[] = [];
  let pgError: string | null = null;
  try {
    const pgResult = await pool.query<{ phone: string; name: string | null }>(
      `WITH friend_users AS (
         SELECT up."userId", up.phone AS via_phone
         FROM "UserPhone" up
         WHERE up.phone = ANY($2)
       ),
       tag_hits AS (
         SELECT ut.phone, ut."contactId"
         FROM "UserTags" ut
         JOIN friend_users fu ON fu."userId" = ut."contactId"
         WHERE LOWER(ut.tag) = ANY($3)
       ),
       alias_hits AS (
         SELECT ua_m.phone, ua_m."contactId"
         FROM "UserAlias" ua_m
         JOIN friend_users fu ON fu."userId" = ua_m."contactId"
         WHERE LOWER(ua_m.alias) LIKE $4
       ),
       matches AS (
         SELECT phone, "contactId" FROM tag_hits
         UNION
         SELECT phone, "contactId" FROM alias_hits
       )
       SELECT DISTINCT ON (m.phone)
              m.phone,
              COALESCE(ua_t.alias, u_t.name) AS name
       FROM matches m
       JOIN friend_users fu ON fu."userId" = m."contactId"
       LEFT JOIN "UserAlias" ua_t ON ua_t.phone = m.phone AND ua_t."contactId" = m."contactId"
       LEFT JOIN "UserPhone" up_t ON up_t.phone = m.phone
       LEFT JOIN "User" u_t ON u_t.id = up_t."userId"
       LEFT JOIN "UserAlias" ua_own ON ua_own.phone = m.phone AND ua_own."contactId" = $1
       WHERE ua_own.phone IS NULL
       ORDER BY m.phone
       LIMIT 20`,
      [userId, friendPhones, [exactTerm], likeTerm],
    );
    pgRows = pgResult.rows;
  } catch (err) {
    pgError = (err as Error).message;
  }

  const t3 = Date.now();

  res.json({
    success: true,
    query: tagQuery,
    userPhone,
    timings_ms: {
      neo4j_fetch: t1 - t0,
      pg_registered_check: t2 - t1,
      pg_search: t3 - t2,
      total: t3 - t0,
    },
    friend_phones_from_neo4j: friendPhones.length,
    registered_ally_friends: registeredFriends.length,
    registered_friend_phones: registeredFriends.map((r) => r.phone),
    pg_results: pgRows,
    pg_error: pgError,
  });
});

/** The phonebook screens are read as the person scrolls and types. */
const PHONEBOOK_PER_MINUTE = 60;
const phonebookLimit = rateLimit({ windowMs: 60_000, max: PHONEBOOK_PER_MINUTE });

function pageSizeOf(raw: unknown): number | null {
  if (raw === undefined || raw === '') return DEFAULT_PAGE_SIZE;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= MAX_PAGE_SIZE ? n : null;
}

/**
 * The frontend's 06:30Z item 4 (design 4.8):
 *   GET /contacts?q=&limit=&cursor=  { contacts: [{ id, name, on_netai }], next_cursor }
 *   GET /contacts/:id                the person's own page about one contact
 */
contactsRouter.get('/', phonebookLimit, async (req: Request, res: Response) => {
  const limit = pageSizeOf(req.query.limit);
  const q = typeof req.query.q === 'string' ? req.query.q : null;
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
  if (limit === null) {
    res.status(400).json({ success: false, error: `limit must be 1 to ${MAX_PAGE_SIZE}` });
    return;
  }
  try {
    const userId = Number((req as AuthenticatedRequest).user.userId);
    const page = await contactPage(userId, { q, limit, cursor });
    if (page === null) {
      res.status(400).json({ success: false, error: 'cursor is not one this list gave' });
      return;
    }
    res.status(200).json({ success: true, data: page });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /contacts]', (error as Error).message);
    res.status(500).json({ success: false, error: 'Could not read the contacts' });
  }
});

contactsRouter.get('/:id', phonebookLimit, async (req: Request, res: Response) => {
  try {
    const userId = Number((req as AuthenticatedRequest).user.userId);
    const page = await contactPageFor(userId, String(req.params.id));
    if (page === null) {
      res.status(404).json({ success: false, error: 'No such contact' });
      return;
    }
    res.status(200).json({ success: true, data: page });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /contacts/:id]', (error as Error).message);
    res.status(500).json({ success: false, error: 'Could not read the contact' });
  }
});

/**
 * The frontend's 14 Oct 14:10Z item 1 (Misho asked for it): the contact's page
 * corrects what Netai keeps. `:id` is the contact id the list and the page
 * give; a contact that is not this person's own is 404, and nothing is written.
 *
 *   GET    /contacts/:id/facts                    the person's own facts, with ids
 *   POST   /contacts/:id/facts          { text }  201, the facts again
 *   PATCH  /contacts/:id/facts/:factId  { text }  200, the facts again
 *   DELETE /contacts/:id/facts/:factId            200, the facts again
 *   DELETE /contacts/:id/exclusions/:exclusionId  200
 *   POST   /contacts/:id/remove                   200 (leaves the network)
 *   POST   /contacts/:id/deceased                 200
 *
 * Item 3 of the frontend's 21:10Z note (Misho's yes):
 *   PUT    /contacts/:id/warmth      { warmth: warm | neutral | distant | null }  200
 *   POST   /contacts/:id/labels      { label }                                   201
 *   DELETE /contacts/:id/labels/:label                                           200
 *   POST   /contacts/:id/exclusions  { goal_id }                                 201
 */
type ContactHandler = (userId: number, phone: string, req: Request, res: Response) => Promise<void>;

function withOwnContact(label: string, handler: ContactHandler) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!validationResult(req).isEmpty()) {
      res.status(400).json({
        success: false,
        error: `text is 1 to ${MAX_FACT_CHARS} characters; ids are numbers`,
      });
      return;
    }
    try {
      const userId = Number((req as AuthenticatedRequest).user.userId);
      const phone = await ownContactPhone(userId, String(req.params.id));
      if (phone === null) {
        res.status(404).json({ success: false, error: 'No such contact' });
        return;
      }
      await handler(userId, phone, req, res);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[${label}]`, (error as Error).message);
      res.status(500).json({ success: false, error: 'Could not change the contact' });
    }
  };
}

async function answerWithFacts(
  res: Response,
  status: number,
  userId: number,
  phone: string,
): Promise<void> {
  res.status(status).json({ success: true, data: { facts: await ownFacts(userId, phone) } });
}

function answerEdit(
  outcome: EditOutcome,
  res: Response,
  onDone: () => Promise<void>,
): Promise<void> {
  if (outcome === EditOutcome.NotFound) {
    res.status(404).json({ success: false, error: 'No such item on this contact' });
    return Promise.resolve();
  }
  return onDone();
}

const factText = body('text').isString().trim().isLength({ min: 1, max: MAX_FACT_CHARS });
const factId = param('factId').isInt({ min: 1 });

contactsRouter.get(
  '/:id/facts',
  phonebookLimit,
  withOwnContact('GET /contacts/:id/facts', (userId, phone, _req, res) =>
    answerWithFacts(res, 200, userId, phone),
  ),
);

contactsRouter.post(
  '/:id/facts',
  phonebookLimit,
  factText,
  withOwnContact('POST /contacts/:id/facts', async (userId, phone, req, res) => {
    await addOwnFact(userId, phone, String(req.body.text));
    await answerWithFacts(res, 201, userId, phone);
  }),
);

contactsRouter.patch(
  '/:id/facts/:factId',
  phonebookLimit,
  factId,
  factText,
  withOwnContact('PATCH /contacts/:id/facts/:factId', async (userId, phone, req, res) => {
    const outcome = await correctOwnFact(
      userId,
      phone,
      Number(req.params.factId),
      String(req.body.text),
    );
    await answerEdit(outcome, res, () => answerWithFacts(res, 200, userId, phone));
  }),
);

contactsRouter.delete(
  '/:id/facts/:factId',
  phonebookLimit,
  factId,
  withOwnContact('DELETE /contacts/:id/facts/:factId', async (userId, phone, req, res) => {
    const outcome = await forgetOwnFact(userId, phone, Number(req.params.factId));
    await answerEdit(outcome, res, () => answerWithFacts(res, 200, userId, phone));
  }),
);

contactsRouter.delete(
  '/:id/exclusions/:exclusionId',
  phonebookLimit,
  param('exclusionId').isInt({ min: 1 }),
  withOwnContact('DELETE /contacts/:id/exclusions', async (userId, phone, req, res) => {
    const outcome = await removeOwnExclusion(userId, phone, Number(req.params.exclusionId));
    await answerEdit(outcome, res, async () => {
      res.status(200).json({ success: true, data: { removed: true } });
    });
  }),
);

contactsRouter.post(
  '/:id/remove',
  phonebookLimit,
  withOwnContact('POST /contacts/:id/remove', async (userId, phone, _req, res) => {
    const removed = await removeFromNetwork(userId, phone);
    res
      .status(removed ? 200 : 500)
      .json(
        removed
          ? { success: true, data: { removed } }
          : { success: false, error: 'Could not remove the contact' },
      );
  }),
);

contactsRouter.post(
  '/:id/deceased',
  phonebookLimit,
  withOwnContact('POST /contacts/:id/deceased', async (userId, phone, _req, res) => {
    const marked = await markDeceased(userId, phone);
    res
      .status(marked ? 200 : 500)
      .json(
        marked
          ? { success: true, data: { marked } }
          : { success: false, error: 'Could not mark the contact' },
      );
  }),
);

export default contactsRouter;

/** Read when a request is checked, not when the module loads (some tests stand the page module in). */
function isWarmth(value: unknown): boolean {
  return value === null || (Object.values(Warmth) as string[]).includes(String(value));
}

contactsRouter.put(
  '/:id/warmth',
  phonebookLimit,
  body('warmth').custom(isWarmth),
  withOwnContact('PUT /contacts/:id/warmth', async (userId, phone, req, res) => {
    const raw = (req.body as { warmth: unknown }).warmth;
    const warmth = raw === null ? null : (String(raw) as Warmth);
    await setOwnWarmth(userId, phone, warmth);
    res.status(200).json({ success: true, data: { warmth } });
  }),
);

const ownLabel = body('label').isString().trim().isLength({ min: 1, max: MAX_OWN_LABEL_CHARS });

contactsRouter.post(
  '/:id/labels',
  phonebookLimit,
  ownLabel,
  withOwnContact('POST /contacts/:id/labels', async (userId, phone, req, res) => {
    await addOwnLabel(userId, phone, String(req.body.label));
    res.status(201).json({ success: true, data: { added: true } });
  }),
);

contactsRouter.delete(
  '/:id/labels/:label',
  phonebookLimit,
  param('label').isString().trim().isLength({ min: 1, max: MAX_OWN_LABEL_CHARS }),
  withOwnContact('DELETE /contacts/:id/labels', async (userId, phone, req, res) => {
    const outcome = await removeOwnLabel(userId, phone, String(req.params.label));
    await answerEdit(outcome, res, async () => {
      res.status(200).json({ success: true, data: { removed: true } });
    });
  }),
);

contactsRouter.post(
  '/:id/exclusions',
  phonebookLimit,
  body('goal_id').isInt({ min: 1 }),
  withOwnContact('POST /contacts/:id/exclusions', async (userId, phone, req, res) => {
    const outcome = await excludeFromGoal(userId, phone, Number(req.body.goal_id));
    await answerEdit(outcome, res, async () => {
      res.status(201).json({ success: true, data: { excluded: true } });
    });
  }),
);
