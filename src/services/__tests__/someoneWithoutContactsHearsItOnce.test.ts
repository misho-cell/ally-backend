jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../threads.service', () => ({
  __esModule: true,
  getOrCreateDefaultThread: jest.fn().mockResolvedValue(90011),
  saveServerLine: jest.fn(),
  userLanguage: jest.fn().mockResolvedValue('ka'),
}));
jest.mock('../productEvents.service', () => ({
  __esModule: true,
  recordProductEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../sse.service', () => ({ __esModule: true, emitMessageAppended: jest.fn() }));
jest.mock('../notification.service', () => ({
  __esModule: true,
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { saveServerLine } from '../threads.service';
import { recordProductEvent } from '../productEvents.service';
import { emitMessageAppended } from '../sse.service';
import { sendPushNotification } from '../notification.service';
import {
  CONTACTS_MISSING_EVENT,
  CONTACTS_MISSING_LINE,
  ContactsLineSeatOutcome,
  MAX_CONTACTS_LINE_SEATS,
  peopleWithoutContacts,
  runContactsMissingForSeats,
  runContactsMissingLines,
  tellContactsMissing,
} from '../contactsMissingLine.service';

/**
 * #7757 / #7828 (M7, Misho 27 Oct „შენი შეთავაზება გააკეთე"): a member who
 * never uploaded contacts hears it once from Netai in their main chat. The
 * other missing steps are the app's card.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSave = saveServerLine as jest.MockedFunction<typeof saveServerLine>;
const rows = (r: unknown[]): never => ({ rows: r, rowCount: r.length }) as never;
/** 12:00 in Tbilisi (UTC+4), outside quiet hours. */
const NOON_TBILISI = new Date('2026-10-27T08:00:00.000Z');
/** 03:00 in Tbilisi. */
const NIGHT_TBILISI = new Date('2026-10-26T23:00:00.000Z');

beforeEach(() => {
  jest.clearAllMocks();
  mockSave.mockResolvedValue({
    id: 501,
    content: CONTACTS_MISSING_LINE.ka,
    createdAt: '2026-10-27T08:00:00.000Z',
  });
});

describe('who is told (#7757)', () => {
  it('only Netai members who never imported, never told, and are not test seats', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ user_id: 7 }, { user_id: 9 }]));
    expect(await peopleWithoutContacts()).toEqual([7, 9]);
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain('"hasAccessToAlly" = true');
    expect(sql).toContain('ia.imported > 0');
    expect(sql).toContain('"UserAlias"');
    expect(sql).toContain('test_seats');
    expect(mockQuery.mock.calls[0][1]).toContain(CONTACTS_MISSING_EVENT);
  });
});

describe('the line (#7757)', () => {
  it('is recorded, saved in the main chat, shown live and pushed', async () => {
    await tellContactsMissing(7);
    expect(recordProductEvent).toHaveBeenCalledWith(7, CONTACTS_MISSING_EVENT, {
      thread_id: 90011,
    });
    expect(mockSave).toHaveBeenCalledWith(90011, 7, CONTACTS_MISSING_LINE.ka);
    expect(emitMessageAppended).toHaveBeenCalledWith(
      '7',
      90011,
      expect.any(String),
      expect.objectContaining({ messageId: '501', content: CONTACTS_MISSING_LINE.ka }),
    );
    expect(sendPushNotification).toHaveBeenCalledWith(
      '7',
      expect.objectContaining({ url: '/chat/90011' }),
    );
  });

  it('carries no dash in any language', () => {
    for (const line of Object.values(CONTACTS_MISSING_LINE)) expect(line).not.toMatch(/[—–]/u);
  });
});

describe('the hourly run (#7757)', () => {
  it('says nothing in quiet hours', async () => {
    expect(await runContactsMissingLines(NIGHT_TBILISI)).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('tells each one due, and goes on past a failure', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ user_id: 7 }, { user_id: 9 }]));
    mockSave.mockRejectedValueOnce(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await runContactsMissingLines(NOON_TBILISI)).toBe(1);
  });
});

describe('the on-demand run on seats (#7757)', () => {
  it('refuses no seats, too many seats, or a real person', async () => {
    expect((await runContactsMissingForSeats([])).outcome).toBe(ContactsLineSeatOutcome.BadInput);
    const many = Array.from({ length: MAX_CONTACTS_LINE_SEATS + 1 }, (_, i) => i + 1);
    expect((await runContactsMissingForSeats(many)).outcome).toBe(ContactsLineSeatOutcome.BadInput);
    mockQuery.mockResolvedValueOnce(rows([{ n: 1 }]));
    expect((await runContactsMissingForSeats([1, 2])).outcome).toBe(
      ContactsLineSeatOutcome.NotATestSeat,
    );
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('tells each seat', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ n: 2 }]));
    expect(await runContactsMissingForSeats([3, 4, 3])).toEqual({
      outcome: ContactsLineSeatOutcome.Ran,
      told: 2,
    });
  });

  it('is reachable as POST /admin/contacts-missing-lines', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    expect(routes).toContain("adminRouter.post('/contacts-missing-lines'");
  });
});
