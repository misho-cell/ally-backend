jest.mock('../threadStatus.service', () => ({
  __esModule: true,
  setThreadStatus: jest.fn().mockResolvedValue(undefined),
}));

import { setThreadStatus } from '../threadStatus.service';
import {
  forgetSearchStage,
  SearchStage,
  showSearchStage,
  showWritingStage,
  stageOfTools,
  STAGE_LINES,
} from '../searchStatus.service';

const mockStatus = setThreadStatus as jest.MockedFunction<typeof setThreadStatus>;
const RUN = 'run-397';

beforeEach(() => {
  jest.clearAllMocks();
  forgetSearchStage(RUN);
});

function linesShown(): unknown[] {
  return mockStatus.mock.calls.map((call) => call[3]?.statusLine);
}

/** Team task #397, founder D581: one sentence that changes, never a list. */
describe('the stage a turn of tool calls is at', () => {
  it('names the source each search tool reads', () => {
    expect(stageOfTools(['search_by_tag'])).toBe(SearchStage.Contacts);
    expect(stageOfTools(['search_second_degree'])).toBe(SearchStage.SecondCircle);
    expect(stageOfTools(['web_search'])).toBe(SearchStage.Web);
  });

  it('takes the furthest of parallel calls, and none for a turn that does not search', () => {
    expect(stageOfTools(['web_search', 'search_by_tag'])).toBe(SearchStage.Web);
    expect(stageOfTools(['get_my_tasks', 'propose_task_plan'])).toBeNull();
  });
});

describe('the status line through a run', () => {
  it('moves contacts → second circle → web → writing on the thread’s one line', async () => {
    await showSearchStage('501', 7, RUN, SearchStage.Contacts, 'ka');
    await showSearchStage('501', 7, RUN, SearchStage.SecondCircle, 'ka');
    await showSearchStage('501', 7, RUN, SearchStage.Web, 'ka');
    await showWritingStage('501', 7, RUN, 'ka');

    expect(linesShown()).toEqual([
      STAGE_LINES.ka.contacts,
      STAGE_LINES.ka.second_circle,
      STAGE_LINES.ka.web,
      STAGE_LINES.ka.writing,
    ]);
    for (const call of mockStatus.mock.calls) {
      expect(call.slice(0, 3)).toEqual(['501', 7, 'working']);
    }
  });

  it('never goes back, and never repeats a stage', async () => {
    await showSearchStage('501', 7, RUN, SearchStage.Web, 'en');
    await showSearchStage('501', 7, RUN, SearchStage.Contacts, 'en');
    await showSearchStage('501', 7, RUN, SearchStage.Web, 'en');
    expect(linesShown()).toEqual([STAGE_LINES.en.web]);
  });

  it('says „writing" only for a run that was shown searching', async () => {
    await showWritingStage('501', 7, RUN, 'ka');
    expect(mockStatus).not.toHaveBeenCalled();
  });

  it('starts over for the next run once this one is forgotten', async () => {
    await showSearchStage('501', 7, RUN, SearchStage.Web, 'ru');
    forgetSearchStage(RUN);
    await showSearchStage('501', 7, RUN, SearchStage.Contacts, 'ru');
    expect(linesShown()).toEqual([STAGE_LINES.ru.web, STAGE_LINES.ru.contacts]);
  });
});
