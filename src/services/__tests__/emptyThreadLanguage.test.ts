jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { threadLanguage } from '../threads.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

/**
 * The seat's 331, measured on Test 1, 20 September — one account, one moment,
 * eleven threads read through `GET /threads/{id}/messages`:
 *
 *   six threads with NO messages     language: "ka"     title: "New conversation"
 *   five threads WITH messages       language: "en"
 *
 * That account has never written a Georgian character. The five are right; the
 * six are two parts of the server falling back to two different defaults in
 * the same response. The title had already been taught to ask the owner. This
 * had not.
 *
 * It is not a display detail. `threadLanguage` is what the reaper and the task
 * engine write their own messages in, and a thread is emptiest exactly when
 * the engine is first writing into it.
 */
describe('an empty thread is not a Georgian thread', () => {
  beforeEach(() => jest.clearAllMocks());

  /**
   * @param inThread the owner's messages IN this thread (newest first)
   * @param anywhere the owner's messages anywhere, read only when the thread is empty
   */
  function route(inThread: string[], anywhere: string[], ownerFound = true): void {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('thread_id = $1'))
        return Promise.resolve(rows(inThread.map((content) => ({ content }))) as never);
      if (sql.includes('FROM threads WHERE id'))
        return Promise.resolve(rows(ownerFound ? [{ user_id: '501' }] : []) as never);
      if (sql.includes('user_id = $1'))
        return Promise.resolve(rows(anywhere.map((content) => ({ content }))) as never);
      return Promise.resolve(rows([]) as never);
    });
  }

  it('falls back to what the owner writes EVERYWHERE, not to Georgian', async () => {
    route([], ['Ask Netai Test 2 whether they can recommend a plumber', 'I approve']);
    await expect(threadLanguage(19273)).resolves.toBe('en');
  });

  it('a Georgian account still gets Georgian, which is most of them', async () => {
    route([], ['გამარჯობა, მჭირდება კარგი ვეტერინარი თბილისში']);
    await expect(threadLanguage(19274)).resolves.toBe('ka');
  });

  it('the thread’s OWN words still decide when it has any', async () => {
    // The owner writes English everywhere else and Georgian here. This thread
    // is Georgian: the fallback is a fallback, not a vote.
    route(['გამარჯობა, მჭირდება ელექტრიკოსი'], ['I approve', 'are you still there?']);
    await expect(threadLanguage(19275)).resolves.toBe('ka');
  });

  it('Georgian survives as the LAST resort — an account that has said nothing', async () => {
    route([], []);
    await expect(threadLanguage(19276)).resolves.toBe('ka');
  });

  it('and for a thread with no owner row at all', async () => {
    route([], ['I approve'], false);
    await expect(threadLanguage(99999)).resolves.toBe('ka');
  });

  it('costs nothing on the ordinary path: no owner lookup when the thread speaks', async () => {
    route(['I approve, go ahead and ask them'], ['ignored']);
    await expect(threadLanguage(19306)).resolves.toBe('en');
    expect(
      mockQuery.mock.calls.some(([sql]) => String(sql).includes('FROM threads WHERE id')),
    ).toBe(false);
  });
});
