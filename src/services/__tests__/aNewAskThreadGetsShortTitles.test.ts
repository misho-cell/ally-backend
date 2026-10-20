import { readFileSync } from 'fs';
import { join } from 'path';

const mockWrite = jest.fn();
jest.mock('../threadTitle.service', () => ({
  __esModule: true,
  writeShortTitles: (...args: unknown[]) => mockWrite(...args),
}));

import { shortTitlesForNewThread } from '../newThreadShortTitles';

const OWNER = '501';
const THREAD_ID = 61234;
const ASK_TITLE = 'ლიკა: გიორგი, ლიკას სურს თორნიკე აბულაძეს გაეცნოს. შეგიძლია დაეხმარო?';

/**
 * 5052 (Giorgi, 15 Oct): an ask or request thread is titled by code when it is
 * created, so it never got the short titles the list and the header show, and
 * its title was cut off with „…".
 */
describe('a thread titled by code gets its short titles too', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWrite.mockResolvedValue(true);
  });

  it('asks for the short titles from the thread’s own title', () => {
    shortTitlesForNewThread(OWNER, { id: THREAD_ID, title: ASK_TITLE });
    expect(mockWrite).toHaveBeenCalledWith(OWNER, THREAD_ID, ASK_TITLE, ASK_TITLE);
  });

  it('asks nothing for a thread with no title', () => {
    shortTitlesForNewThread(OWNER, { id: THREAD_ID, title: null });
    shortTitlesForNewThread(OWNER, { id: THREAD_ID, title: '   ' });
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('does not make the caller wait for the model', () => {
    mockWrite.mockReturnValue(new Promise(() => undefined));
    expect(shortTitlesForNewThread(OWNER, { id: THREAD_ID, title: ASK_TITLE })).toBeUndefined();
  });

  const source = (path: string): string => readFileSync(join(__dirname, '..', path), 'utf8');

  it('is asked for when an ask thread is opened', () => {
    const asks = source('taskAsks.service.ts');
    const fn = asks.slice(asks.indexOf('async function openAskThread('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    // #6903: from the whole question, not the cut title.
    expect(body).toContain('shortTitlesForNewThread(String(toUserId), {');
    expect(body).toContain('title: askThreadTitle(senderName, titleBodyOf(safeQuestion)),');
  });

  it('is asked for on both threads of a new request', () => {
    const intro = source('tools/requestIntroduction.ts');
    const fn = intro.slice(intro.indexOf('async function deliverIntoNewThreads('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain(
      'shortTitlesForNewThread(String(stored.mediatorUserId), incomingThread);',
    );
    expect(body).toContain(
      'shortTitlesForNewThread(String(stored.requesterUserId), outgoingThread);',
    );
  });
});
