jest.mock('../../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  default: {},
}));
jest.mock('../../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { drainedLine } from '../threads.routes';
import { RUN_STRINGS } from '../../../services/runLanguage';
import { storedNoticeTexts } from '../../../services/cutOffRunResume.service';

/** #6361 (the tester's 61728 / 61729, 20 Oct): a queued message whose turn came during a deploy. */
describe('a message whose turn came while the server was leaving', () => {
  it('gets the cut-off line, not „technical fault, try again"', () => {
    expect(drainedLine(new Error('RUN_DRAINED'), 'ka')).toBe(RUN_STRINGS.ka.restartedMidRun);
    expect(drainedLine(new Error('RUN_DRAINED'), 'en')).toBe(RUN_STRINGS.en.restartedMidRun);
  });

  it('is a line the next container looks for and runs again', () => {
    expect(storedNoticeTexts()).toContain(drainedLine(new Error('RUN_DRAINED'), 'ka'));
  });

  it('leaves every other failure as it was', () => {
    expect(drainedLine(new Error('boom'), 'ka')).toBe(RUN_STRINGS.ka.runDied);
    expect(drainedLine('RUN_DRAINED', 'ka')).toBe(RUN_STRINGS.ka.runDied);
  });
});
