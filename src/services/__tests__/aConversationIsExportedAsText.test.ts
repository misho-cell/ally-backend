jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../threads.service', () => ({ __esModule: true, getThreadMessages: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { getThreadMessages, ThreadMessage } from '../threads.service';
import {
  conversationText,
  exportConversation,
  exportFilename,
} from '../conversationExport.service';

const mockMessages = getThreadMessages as jest.MockedFunction<typeof getThreadMessages>;
const NOW = '2026-10-03T10:45:00.000Z';

function msg(overrides: Partial<ThreadMessage>): ThreadMessage {
  return {
    id: 'a',
    role: 'user',
    content: 'text',
    kind: 'message',
    run_id: null,
    created_at: '2026-10-03T09:30:00.000Z',
    choices: null,
    ...overrides,
  } as ThreadMessage;
}

beforeEach(() => jest.clearAllMocks());

/** Board #71: „export chat", to take a conversation to another assistant. */
describe('a conversation as a text file', () => {
  it('reads in order with who spoke, when, and the buttons offered', () => {
    const text = conversationText(
      'ავეჯის სახელოსნო',
      [
        msg({ content: 'შეკვეთით ვაკეთებ სამზარეულოებს.' }),
        msg({
          role: 'assistant',
          content: 'ვისთან მუშაობ უფრო ხშირად?',
          created_at: '2026-10-03T09:31:00.000Z',
          choices: ['კერძო კლიენტები', 'დეველოპერები'],
        }),
      ],
      'ka',
      NOW,
    );
    expect(text).toBe(
      'ავეჯის სახელოსნო\nNetai-დან ექსპორტი, 2026-10-03 10:45 (დრო UTC-ით)\n\n' +
        '[2026-10-03 09:30] შენ:\nშეკვეთით ვაკეთებ სამზარეულოებს.\n\n' +
        '[2026-10-03 09:31] Netai:\nვისთან მუშაობ უფრო ხშირად?\n' +
        '(ღილაკები: კერძო კლიენტები | დეველოპერები)\n',
    );
  });

  it('speaks English to an English conversation', () => {
    const text = conversationText(null, [msg({ content: 'hi' })], 'en', NOW);
    expect(
      text.startsWith('Conversation\nExported from Netai, 2026-10-03 10:45 (times in UTC)'),
    ).toBe(true);
    expect(text).toContain('] You:\nhi');
  });

  it('leaves out failure lines and empty rows', () => {
    const text = conversationText(
      'x',
      [msg({ kind: 'error', content: 'try again' }), msg({ content: '   ' })],
      'en',
      NOW,
    );
    expect(text).not.toContain('try again');
    expect(text).not.toContain('You:');
  });

  it('names the file after the title, in any script, or the thread id', () => {
    expect(exportFilename('ავეჯის სახელოსნო!', 32573, NOW)).toBe('ავეჯის-სახელოსნო-2026-10-03.txt');
    expect(exportFilename(null, 32573, NOW)).toBe('netai-32573-2026-10-03.txt');
  });

  it('reads every page of a long thread, oldest first', async () => {
    const full = Array.from({ length: 200 }, (_, i) =>
      msg({ id: `n${i}`, content: `new ${i}`, created_at: '2026-10-03T09:00:00.000Z' }),
    );
    mockMessages
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce([msg({ id: 'o1', content: 'oldest' })]);
    const file = await exportConversation({ id: 9, title: 't' }, 'en', NOW);
    expect(mockMessages).toHaveBeenCalledTimes(2);
    expect(mockMessages.mock.calls[1][1]).toMatchObject({ beforeId: 'n0', limit: 200 });
    expect(file.text.indexOf('oldest')).toBeLessThan(file.text.indexOf('new 0'));
  });
});

describe('the route', () => {
  it('is owner-checked, rate limited and returns { filename, text }', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'threads.routes.ts'),
      'utf8',
    );
    const route = routes.slice(routes.indexOf("'/:id/export'")).slice(0, 1200);
    expect(route).toContain('rateLimit({ windowMs: 60_000, max: 10 })');
    expect(route).toContain('const thread = await getThread(threadId, userId);');
    expect(route).toContain("res.status(404).json({ success: false, error: 'Thread not found' });");
    expect(route).toContain('res.status(200).json({ success: true, data: file });');
  });
});
