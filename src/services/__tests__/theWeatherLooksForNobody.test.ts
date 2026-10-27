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

  /**
   * The speed half (58029: 18.0 / 19.2 / 19.1 s against 12): the server searches
   * first and the model answers in its first turn, from the opening-search
   * section. If the server's search fails, the run searches itself as before.
   */
  it('searches before the first turn, and the first turn is the answer', () => {
    expect(source).toContain(
      "await weatherFoundFirst(userId, threadId, runId, lastOwnerText(messages) ?? '')",
    );
    expect(source).toContain("const systemPrompt = promptBeforeTheRun + (weatherFound ?? '');");
    expect(source).toMatch(
      /weatherFound === null\s+\? \{ forceTool: WEB_SEARCH_TOOL \}\s+: \{ forceText: true, maxTokens: DISCUSS_MAX_TOKENS \}/,
    );
  });

  it('logs, costs and registers the server’s weather search like the model’s own', () => {
    const fn = source.slice(source.indexOf('async function weatherFoundFirst('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain('...(await webSearchLedger())');
    expect(body).toContain("tool: 'web_search:weather'");
    expect(body).toContain('registerWebResult(runId, raw);');
    expect(body).toContain('buildOpeningSearchSection(');
  });
});

describe('every call in the run reads the weather the server found (58065)', () => {
  it('is part of the run’s prompt before the first call and the final writer', () => {
    const at = source.indexOf("const systemPrompt = promptBeforeTheRun + (weatherFound ?? '');");
    expect(at).toBeGreaterThan(source.indexOf('const weatherFound = weatherLookUp'));
    expect(at).toBeLessThan(source.indexOf('const writeWith = async (model: string)'));
    expect(at).toBeLessThan(
      source.indexOf('let response = await callClaude(messages, systemPrompt'),
    );
  });
});
