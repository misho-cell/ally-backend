/**
 * The tester's channel.
 *
 * Two things here are worth protecting and the rest is a list and a counter.
 *
 * 1. The author is DECLARED, never inferred from the login. Everyone posts
 *    through an admin session, so an inferred author would file every line the
 *    backend writes under Misho's name — a product saying a person wrote what
 *    a machine wrote.
 * 2. A reader's place in the thread never moves backwards. Two tabs open on
 *    the same thread would otherwise let the slower one un-read what the
 *    faster one has seen, and the same messages would be new for ever.
 */
jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import {
  HandoffAuthor,
  isHandoffAuthor,
  markHandoffRead,
  postHandoff,
  readHandoff,
} from '../handoff.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

const MESSAGE = {
  id: 7,
  author: 'claude_backend',
  body: 'ticket 19 is deployed',
  posted_by: '167250',
  created_at: new Date('2026-09-15T08:00:00.000Z'),
};

beforeEach(() => {
  mockQuery.mockReset();
});

describe('who a message is from', () => {
  it('accepts only the four known authors', () => {
    expect(isHandoffAuthor('tester')).toBe(true);
    expect(isHandoffAuthor('claude_backend')).toBe(true);
    // Not a free text field: an unknown name is how „Misho said this" quietly
    // becomes true of something he never wrote.
    expect(isHandoffAuthor('Tornike')).toBe(false);
    expect(isHandoffAuthor('')).toBe(false);
    expect(isHandoffAuthor(undefined)).toBe(false);
  });

  it('keeps the login that actually posted, beside the author it claims', async () => {
    mockQuery.mockResolvedValue(rows([MESSAGE]) as never);

    await postHandoff(HandoffAuthor.ClaudeBackend, 'ticket 19 is deployed', '167250');

    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe('claude_backend');
    expect(params[2]).toBe('167250');
  });

  it('refuses an empty message rather than storing a blank line', async () => {
    await expect(postHandoff(HandoffAuthor.Tester, '   ', '1')).rejects.toThrow('empty');
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('how far a reader has read', () => {
  it('never moves backwards', async () => {
    mockQuery.mockResolvedValue(rows([{ last_seen_id: 42 }]) as never);

    await markHandoffRead('tester', 12);

    const [sql] = mockQuery.mock.calls[0] as [string];
    // The database decides, not the caller: a second tab reporting an older
    // position must not un-read what the first has already seen.
    expect(sql).toContain('GREATEST(handoff_reads.last_seen_id, EXCLUDED.last_seen_id)');
  });

  it('refuses a nameless reader', async () => {
    await expect(markHandoffRead('  ', 5)).rejects.toThrow('reader');
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('reading the thread', () => {
  it('counts what this reader has not seen', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('MAX(id)')) return Promise.resolve(rows([{ latest: 10 }])) as never;
      if (sql.includes('FROM handoff_reads')) {
        return Promise.resolve(rows([{ last_seen_id: 7 }])) as never;
      }
      return Promise.resolve(rows([MESSAGE])) as never;
    });

    const thread = await readHandoff({ reader: 'tester' });

    expect(thread.latest_id).toBe(10);
    expect(thread.last_seen_id).toBe(7);
    expect(thread.unread).toBe(3);
  });

  it('says nothing about unread when nobody asked as a reader', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('MAX(id)')) return Promise.resolve(rows([{ latest: 10 }])) as never;
      return Promise.resolve(rows([MESSAGE])) as never;
    });

    const thread = await readHandoff({});

    // Null, not zero. „Nobody asked" and „nothing unread" are different
    // answers, and zero would be the engine inventing the second one.
    expect(thread.unread).toBeNull();
    expect(thread.last_seen_id).toBeNull();
  });

  it('hands back the login the server saw, without judging it against the author', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('MAX(id)')) return Promise.resolve(rows([{ latest: 7 }])) as never;
      return Promise.resolve(rows([MESSAGE])) as never;
    });

    const thread = await readHandoff({});

    // The fact is returned; no comparison is made. `author` is a role and
    // `posted_by` is an account id, so they differ on every legitimate row too
    // — a flag built on that would mark everything and mean nothing.
    expect(thread.messages[0].posted_by).toBe('167250');
    expect(thread.messages[0].author).toBe('claude_backend');
  });

  it('dates a message as ISO 8601, which a phone can read', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('MAX(id)')) return Promise.resolve(rows([{ latest: 7 }])) as never;
      return Promise.resolve(rows([MESSAGE])) as never;
    });

    const thread = await readHandoff({});

    expect(thread.messages[0].created_at).toBe('2026-09-15T08:00:00.000Z');
  });

  it('reads the thread oldest first, because it is a conversation', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('MAX(id)')) return Promise.resolve(rows([{ latest: 7 }])) as never;
      return Promise.resolve(rows([MESSAGE])) as never;
    });

    await readHandoff({ sinceId: 3 });

    const [sql, params] = mockQuery.mock.calls.find(([s]) =>
      String(s).includes('FROM handoff_messages'),
    ) as [string, unknown[]];
    expect(sql).toContain('ORDER BY id ASC');
    expect(params[0]).toBe(3);
  });
});
