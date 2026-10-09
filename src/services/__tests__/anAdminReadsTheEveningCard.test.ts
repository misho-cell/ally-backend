import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { currentEveningCard, snoozeEveningCard } from '../eveningCard.service';
import {
  AdminSnoozeOutcome,
  eveningCardForAdmin,
  snoozeSeatEveningCard,
} from '../adminEveningCard.service';

jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../eveningCard.service', () => ({
  currentEveningCard: jest.fn(),
  snoozeEveningCard: jest.fn(),
}));

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockScreen = currentEveningCard as jest.MockedFunction<typeof currentEveningCard>;
const mockSnooze = snoozeEveningCard as jest.MockedFunction<typeof snoozeEveningCard>;

const SEAT = 181646;
const CARD = 826;

/** #1850 (box 48942): the tester reads and snoozes the evening card from the admin side. */
describe('the admin read of a person’s evening card', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the screen as the person sees it and the newest card row', async () => {
    const screen = { id: CARD, due_at: '2026-10-09T15:00:00.000Z', snoozes: 0, items: [] };
    mockScreen.mockResolvedValueOnce(screen);
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: String(CARD),
          due_at: new Date('2026-10-09T15:00:00Z'),
          sent_at: new Date('2026-10-09T15:00:51Z'),
          snoozes: 0,
          asks: '3',
        },
      ],
    } as never);
    await expect(eveningCardForAdmin(SEAT)).resolves.toEqual({
      screen,
      latest: {
        id: CARD,
        due_at: '2026-10-09T15:00:00.000Z',
        sent_at: '2026-10-09T15:00:51.000Z',
        snoozes: 0,
        asks: 3,
      },
    });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('WHERE c.user_id = $1');
    expect(String(sql)).toContain('LIMIT 1');
    expect(params).toEqual([SEAT]);
  });

  it('says null when the person never had a card', async () => {
    mockScreen.mockResolvedValueOnce(null);
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await expect(eveningCardForAdmin(SEAT)).resolves.toEqual({ screen: null, latest: null });
  });
});

describe('the admin snooze of an evening card', () => {
  beforeEach(() => jest.clearAllMocks());

  it('snoozes a fictional seat’s card', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: SEAT }] } as never);
    mockSnooze.mockResolvedValueOnce(new Date('2026-10-09T17:05:00Z'));
    await expect(snoozeSeatEveningCard(SEAT, CARD)).resolves.toEqual({
      outcome: AdminSnoozeOutcome.Snoozed,
      due_at: '2026-10-09T17:05:00.000Z',
    });
    expect(mockSnooze).toHaveBeenCalledWith(SEAT, CARD);
  });

  it('refuses a real person, and never touches their card', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await expect(snoozeSeatEveningCard(SEAT, CARD)).resolves.toEqual({
      outcome: AdminSnoozeOutcome.NotATestSeat,
    });
    expect(mockSnooze).not.toHaveBeenCalled();
  });

  it('says not found when the card is not the seat’s or not shown', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: SEAT }] } as never);
    mockSnooze.mockResolvedValueOnce(null);
    await expect(snoozeSeatEveningCard(SEAT, CARD)).resolves.toEqual({
      outcome: AdminSnoozeOutcome.NotFound,
    });
  });
});

describe('the routes', () => {
  const admin = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
    'utf8',
  );

  it('reads at GET /admin/users/:userId/evening-card, refusing a non-numeric user', () => {
    const route = admin.slice(admin.indexOf("adminRouter.get('/users/:userId/evening-card'"));
    expect(route.slice(0, 400)).toContain(
      "res.status(400).json({ success: false, error: 'userId უნდა იყოს რიცხვი' })",
    );
  });

  it('snoozes at POST …/evening-card/:cardId/snooze, 403 for a real person, 404 for no card', () => {
    const route = admin.slice(admin.indexOf("'/users/:userId/evening-card/:cardId/snooze'"));
    expect(route.slice(0, 1200)).toContain('res.status(403)');
    expect(route.slice(0, 1200)).toContain('res.status(404)');
  });
});
