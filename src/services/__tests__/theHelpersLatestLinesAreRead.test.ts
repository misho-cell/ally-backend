jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { helpersOwnLine } from '../taskAsks.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const ASK_THREAD = 65176;
const LINK = 'https://app.example.com/invite?t=x6nuzcvcm6tsq2mudq&preview=whatsapp';

/** Newest first, as the read returns them. */
function lines(rows: ReadonlyArray<{ role: string; content: string }>): void {
  mockQuery.mockResolvedValueOnce({ rows } as never);
}

beforeEach(() => mockQuery.mockReset());

/**
 * Tester 75902 (thread 65176, 25 Oct): the helper sent the invite link, then
 * „send it yourself, can you?" — only the last line was read, so the link
 * looked added and every send was refused.
 */
describe("the helper's own lines an answer is checked against", () => {
  it('are all of their latest lines, oldest first', async () => {
    lines([
      { role: 'user', content: 'გაუგზავნე შენით, შეგიძლია?' },
      { role: 'user', content: LINK },
      { role: 'assistant', content: 'მადლობა, პასუხი გაიგზავნა.' },
      { role: 'user', content: 'მაქვს და გავუგზავნი' },
    ]);
    await expect(helpersOwnLine(ASK_THREAD)).resolves.toBe(`${LINK}\nგაუგზავნე შენით, შეგიძლია?`);
  });

  it('still reach past a line the assistant wrote after them', async () => {
    lines([
      { role: 'assistant', content: 'ვაგზავნი.' },
      { role: 'user', content: LINK },
      { role: 'assistant', content: 'რა ბმულია?' },
    ]);
    await expect(helpersOwnLine(ASK_THREAD)).resolves.toBe(LINK);
  });

  it('are nothing when the helper has written nothing', async () => {
    lines([{ role: 'assistant', content: 'გამარჯობა' }]);
    await expect(helpersOwnLine(ASK_THREAD)).resolves.toBe('');
  });
});
