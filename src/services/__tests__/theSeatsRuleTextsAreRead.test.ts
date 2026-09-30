jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { toolDescription } from '../chat.service';
import {
  RULE_268_QUIET_DAY_ONE,
  RULE_268_QUIET_DAY_THREE,
  RULE_273_EACH_ANSWER_ONCE,
  RULE_280_WEB_LEADS_ARE_PEOPLE,
  RULE_284_ONE_REPLY_ONE_GOAL,
} from '../testerRules';

/**
 * The seat's rule texts for rows 280, 284, 273 and 268 (their 866): placed
 * word for word, each where it is read.
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');

describe("the seat's rule texts are where they are read", () => {
  it('280 rides with web_search, and names the page tool that exists', () => {
    expect(toolDescription('web_search')).toContain(RULE_280_WEB_LEADS_ARE_PEOPLE);
    expect(RULE_280_WEB_LEADS_ARE_PEOPLE).toMatch(/^WEB LEADS ARE PEOPLE, NOT PAGES\./);
    expect(RULE_280_WEB_LEADS_ARE_PEOPLE).toContain('fetch_page');
  });

  it('284 and 273 are in every run', () => {
    expect(chat).toContain('`\\n\\n${RULE_284_ONE_REPLY_ONE_GOAL}\\n${RULE_273_EACH_ANSWER_ONCE}`');
    expect(RULE_284_ONE_REPLY_ONE_GOAL).toMatch(/^ONE REPLY, ONE GOAL\./);
    expect(RULE_273_EACH_ANSWER_ONCE).toMatch(/^EACH ANSWER ONCE\./);
  });

  it('268 is read by the day-one and the day-three wakes', () => {
    expect(engine).toContain('RULE_268_QUIET_DAY_ONE,');
    expect(engine).toContain('RULE_268_QUIET_DAY_THREE,');
    expect(RULE_268_QUIET_DAY_ONE).toMatch(/Day 1 quiet/);
    expect(RULE_268_QUIET_DAY_THREE).toMatch(/Day 3 quiet/);
  });
});
