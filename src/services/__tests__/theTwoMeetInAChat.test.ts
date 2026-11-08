jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../threads.service', () => ({
  __esModule: true,
  createThread: jest.fn(),
  saveThreadMessage: jest.fn(),
  userLanguage: jest.fn().mockResolvedValue('ka'),
}));
jest.mock('../notification.service', () => ({
  __esModule: true,
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../readerSavedName', () => ({
  __esModule: true,
  nameAsReaderSaved: jest.fn(async (_r: number, _p: number, name: string) => name),
}));
jest.mock('../askTranslation.service', () => ({
  __esModule: true,
  relayedForReader: jest.fn(async (text: string) => ({ text })),
}));

import { query } from '../../db/postgres/client';
import { createThread, saveThreadMessage } from '../threads.service';
import { openMeetingChat, relayInMeetingChat } from '../meetingChat.service';
import { askerGreeting, meetingOpening, relayedLine, targetGreeting } from '../meetingChat';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockCreate = createThread as jest.MockedFunction<typeof createThread>;
const mockSave = saveThreadMessage as jest.MockedFunction<typeof saveThreadMessage>;

const ASKER = 11;
const TARGET = 22;
const MEDIATOR = 33;

beforeEach(() => {
  jest.clearAllMocks();
  let nextThread = 900;
  mockCreate.mockImplementation(async () => ({ id: nextThread++ }) as never);
  mockSave.mockResolvedValue(undefined);
});

/**
 * #8878 (founder, 4 Nov): A asks B to introduce C; B and C say yes — a new A↔C
 * chat appears for both, with the greetings and A's need, and B is told.
 */
describe('#8878: after the double yes the two meet in a chat', () => {
  it('opens one thread each, greeting both ways, the need on the target’s side', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id FROM meeting_chats')) return { rows: [] } as never;
      if (sql.includes('FROM "User"')) {
        return {
          rows: [
            { id: ASKER, name: 'ერეკლე' },
            { id: TARGET, name: 'გიგი' },
            { id: MEDIATOR, name: 'თორნიკე' },
          ],
        } as never;
      }
      return { rows: [], rowCount: 1 } as never;
    });

    const opened = await openMeetingChat({
      requestId: 5,
      askerUserId: ASKER,
      targetUserId: TARGET,
      mediatorUserId: MEDIATOR,
      need: 'იპოთეკაზე რჩევა სჭირდება',
    });

    expect(opened).toBe(true);
    expect(mockCreate).toHaveBeenCalledWith(String(TARGET), 'regular', 'ერეკლე — გაცნობა');
    expect(mockCreate).toHaveBeenCalledWith(String(ASKER), 'regular', 'გიგი — გაცნობა');
    const targetLines = mockSave.mock.calls.filter((c) => c[1] === TARGET).map((c) => c[3]);
    expect(targetLines[0]).toContain('**ერეკლე**');
    expect(targetLines[1]).toContain('იპოთეკაზე რჩევა სჭირდება');
    const askerLines = mockSave.mock.calls.filter((c) => c[1] === ASKER).map((c) => c[3]);
    // Tester's report 8 Nov, C4: the assistant says who agreed; nothing is written in Gigi's name.
    expect(askerLines[1]).toContain('გიგი გაცნობას დათანხმდა.');
    expect(askerLines[1]).not.toContain('**გიგი:**');
    const insert = mockQuery.mock.calls.find((c) =>
      String(c[0]).includes('INSERT INTO meeting_chats'),
    );
    expect(insert?.[1]).toEqual([5, ASKER, 901, TARGET, 900]);
  });

  it('opens it once', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 1 }] } as never);
    expect(
      await openMeetingChat({
        requestId: 5,
        askerUserId: ASKER,
        targetUserId: TARGET,
        mediatorUserId: null,
        need: null,
      }),
    ).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('carries a line to the other side, naming who wrote it', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('UNION SELECT target_thread_id'))
        return { rows: [{ thread_id: 901 }] } as never;
      if (sql.includes('other_user_id')) {
        return { rows: [{ other_user_id: TARGET, other_thread_id: 900 }] } as never;
      }
      if (sql.includes('FROM "User"')) return { rows: [{ id: ASKER, name: 'ერეკლე' }] } as never;
      return { rows: [] } as never;
    });

    expect(await relayInMeetingChat(String(ASKER), 901, 'ხვალ დაგირეკავ')).toBe(true);
    expect(mockSave).toHaveBeenCalledWith(900, TARGET, 'assistant', '**ერეკლე:** ხვალ დაგირეკავ');
  });

  it('leaves an ordinary chat to the run', async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);
    expect(await relayInMeetingChat('44', 123, 'გამარჯობა')).toBe(false);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('says what the chat is and who introduced them', () => {
    expect(meetingOpening('en', 'Gigi', 'Tornike')).toBe(
      'This chat is between you and **Gigi** — Tornike introduced you. What you write here reaches Gigi.',
    );
    expect(askerGreeting('en', 'Erekle', 'Tornike', null)).not.toContain('ask you about');
    // Tester's report 8 Nov, C4: nothing is written in a person's name that they never typed.
    expect(askerGreeting('ka', 'ერეკლე', 'თორნიკე', 'ბუღალტერი')).toBe(
      'ერეკლე შენთან თორნიკის გავლით დაგიკავშირდა. რაზეა საქმე: ბუღალტერი',
    );
    expect(targetGreeting('ka', 'ზურა', 'ირაკლი')).toBe('ზურა გაცნობას დათანხმდა.');
    expect(targetGreeting('en', 'Zura', 'Irakli')).not.toContain('**');
    expect(relayedLine('A', '  hi  ')).toBe('**A:** hi');
  });
});
