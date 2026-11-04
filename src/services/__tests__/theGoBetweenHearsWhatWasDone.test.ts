jest.mock('../introduction.service', () => ({
  __esModule: true,
  resolveIntroductionRequest: jest.fn(),
  pendingIntroInMediatorThread: jest.fn(),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { resolveIntroductionRequest } from '../introduction.service';
import { respondToIntroduction } from '../tools/respondToIntroduction';
import { introAcceptedByYes, INTRO_ACCEPTED_BY_YES } from '../introYes';

const mockResolve = resolveIntroductionRequest as jest.MockedFunction<
  typeof resolveIntroductionRequest
>;
const DONE = 'მადლობა! ერეკლეს გადავეცი გიგის კონტაქტი შენი წიგნაკიდან.';

/**
 * #8912 (a real case, tester 82704): the go-between saw only a fixed line, with no
 * word that the number came from his own phonebook, and his assistant's reply was
 * dropped. Now the run is told what was done, and says it.
 */
describe('#8912: the go-between hears what was done, from the run', () => {
  beforeEach(() => jest.clearAllMocks());

  it('hands the run what was done on a chat answer', async () => {
    mockResolve.mockResolvedValue({ ok: true, status: 'accepted', whatWasDone: DONE });
    const out = (await respondToIntroduction('7', 9, true)) as Record<string, unknown>;
    expect(out.what_was_done).toBe(DONE);
    expect(String(out.note)).toContain('in your own words');
    expect(mockResolve.mock.calls[0][3]).toMatchObject({ source: 'chat' });
  });

  it('answers through the connector as the connector, so the app writes its line', async () => {
    mockResolve.mockResolvedValue({ ok: true, status: 'declined' });
    const out = (await respondToIntroduction('7', 9, false, undefined, 'connector')) as Record<
      string,
      unknown
    >;
    expect(mockResolve.mock.calls[0][3]).toMatchObject({ source: 'connector' });
    expect(out).not.toHaveProperty('what_was_done');
  });

  it('gives a plain yes the same facts', () => {
    expect(introAcceptedByYes(DONE)).toContain(DONE);
    expect(introAcceptedByYes(undefined)).toBe(INTRO_ACCEPTED_BY_YES);
  });

  it('writes the close line only when no run is there to say it', () => {
    const intro = readFileSync(join(__dirname, '..', 'introduction.service.ts'), 'utf8');
    expect(intro).toContain("const theRunSaysIt = opts.source === 'chat';");
    expect(intro).toContain("if (action !== 'snooze' && !theRunSaysIt) {");
  });
});
