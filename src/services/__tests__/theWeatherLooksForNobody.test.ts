import { readFileSync } from 'fs';
import { join } from 'path';
import { needsNoOpeningSearch } from '../goalIntent';
import { asksTheWeather } from '../smallTalk';

/**
 * 3106, the weather half (re-run 13 Oct 01:50Z, seats 183717–183719): „დღეს რა
 * ამინდია თბილისში?" sent as a goal ran search_by_tag:way_in beside web_search
 * on every run. A weather page's title handed the phonebook lookup „Weather" and
 * „ამინდი". Nobody is looked for in a weather question.
 */
const TESTERS_LINE = 'დღეს რა ამინდია თბილისში?';
const source = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('a weather question looks for nobody (3106)', () => {
  it('reads the tester’s line as a weather question, which the old opening rule did not', () => {
    expect(asksTheWeather(TESTERS_LINE)).toBe(true);
    expect(needsNoOpeningSearch(TESTERS_LINE)).toBe(false);
  });

  it('opens no opening search on a weather question', () => {
    expect(source).toContain(
      'autoGoalId === null || needsNoOpeningSearch(userMessage) || asksTheWeather(userMessage)',
    );
  });

  it('marks the weather run and skips the way-in lookup on its web search', () => {
    expect(source).toContain('if (weatherLookUp) runLooksUpTheWeather.add(runId);');
    expect(source).toContain('runId !== undefined && runLooksUpTheWeather.has(runId)');
    expect(source).toContain('runLooksUpTheWeather.delete(runId);');
  });

  it('still looks the weather up on the web', () => {
    expect(source).toContain('...(weatherLookUp && { forceTool: WEB_SEARCH_TOOL })');
  });
});
