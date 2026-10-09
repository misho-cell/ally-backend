import { readFileSync } from 'fs';
import { join } from 'path';
import { repeatNoSearch } from '../chat.service';

/**
 * The tester's 1119 (F3, 35008): a repeated need was told „this is the request I
 * already hold" and then ran a full new search, 14 calls in 90 s. On a turn
 * that repeats an open goal the server refuses the searches.
 */
const CHAT = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('a turn that repeats an open goal', () => {
  it('remembers the goal it repeats, and forgets it with the run', () => {
    expect(CHAT).toContain(
      'if (repeatedGoal !== null) runRepeatedGoal.set(runId, repeatedGoal.id);',
    );
    expect(CHAT).toContain('runRepeatedGoal.delete(runId);');
  });

  it('refuses the searches before any of them runs', () => {
    const executor = CHAT.indexOf('async function executeToolCall(');
    const guard = CHAT.indexOf('if (repeated !== undefined && REPEAT_REFUSED_TOOLS.has(name)) {');
    const firstSearch = CHAT.indexOf("case 'web_search': {");
    expect(guard).toBeGreaterThan(executor);
    expect(firstSearch).toBeGreaterThan(guard);
  });

  it('refuses the web and the network alike', () => {
    const list = CHAT.slice(
      CHAT.indexOf('const REPEAT_REFUSED_TOOLS'),
      CHAT.indexOf('export function repeatNoSearch('),
    );
    for (const tool of ['search_by_tag', 'search_second_degree', 'web_search', 'fetch_page']) {
      expect(list).toContain(`'${tool}'`);
    }
    expect(list).not.toContain("'get_my_tasks'");
  });

  it('tells the model to say where the goal stands', () => {
    const text = repeatNoSearch(4321);
    expect(text).toContain('goal 4321');
    expect(text).toContain('where that goal stands');
    expect(text).toContain('do not search');
  });
});

/** 3928 run 2 (conv 48521): „…ჰკითხე X-ს და Y-ს." is an instruction, never a repeat. */
describe('an order to ask named people on the open goal’s subject', () => {
  it('is bound to the goal but not walled as a repeat', () => {
    expect(CHAT).toContain(
      'const repeatedGoal = ownerLineNamesPeopleToAsk(userMessage) ? null : goalForRequest.repeats;',
    );
    const fn = CHAT.slice(CHAT.indexOf('function ownerLineNamesPeopleToAsk('));
    expect(fn.slice(0, 300)).toContain('instructionNames(sentence).length > 0');
  });
});
