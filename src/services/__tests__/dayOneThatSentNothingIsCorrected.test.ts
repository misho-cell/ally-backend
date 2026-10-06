import { readFileSync } from 'fs';
import { join } from 'path';
import { DAY_ONE_NOT_SENT_EVENT, DAY_ONE_NOTHING_SENT_LINE } from '../taskEngine.events';

/**
 * #2014 (tester 42341): day one wrote to nobody and closed on „I've already
 * reached out to the one person on the plan". The server reads the asks after
 * day one, asks the run once more, and corrects the line if that sends nothing.
 */
const LANGUAGES = ['ka', 'en', 'ru', 'es'] as const;
const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');

describe('a day one that sent nothing', () => {
  it('is checked after day one runs', () => {
    const dayOne = engine.slice(engine.indexOf('export function startDayOne'));
    expect(dayOne.slice(0, 4000)).toContain('await askAgainIfDayOneSentNothing(taskId);');
  });

  it('reads the asks table, not the reply', () => {
    const check = engine.slice(engine.indexOf('async function dayOneSentNothing'));
    const body = check.slice(0, check.indexOf('\n}\n'));
    expect(body).toContain('FROM task_asks a');
  });

  /** #2113 (goal 19836): Mari asked and Nika's question on her evening card is not „nothing". */
  it('counts a question held on an evening card, and fires only at zero', () => {
    const check = engine.slice(engine.indexOf('async function dayOneSentNothing'));
    const body = check.slice(0, check.indexOf('\n}\n'));
    expect(body).toContain('FROM held_asks h');
    expect(body).toContain('FROM introduction_requests r');
    expect(body).toContain('row.reached > 0) return false');
  });

  it('asks the run once more, and corrects the owner only if that sends nothing too', () => {
    const again = engine.slice(engine.indexOf('async function askAgainIfDayOneSentNothing'));
    const body = again.slice(0, again.indexOf('\n}\n'));
    expect(body).toContain('DAY_ONE_NOT_SENT_EVENT');
    expect(body).toContain(
      'if (await dayOneSentNothing(taskId)) await correctTheDayOneLine(taskId);',
    );
    // once: the follow-up wake does not itself call askAgainIfDayOneSentNothing
    expect(body.match(/askAgainIfDayOneSentNothing/g)).toHaveLength(1);
  });

  it('tells the run the claim was false and forbids repeating it, in every language', () => {
    for (const language of LANGUAGES) {
      expect(DAY_ONE_NOT_SENT_EVENT[language].length).toBeGreaterThan(100);
    }
    expect(DAY_ONE_NOT_SENT_EVENT.en).toContain(
      'Never say you wrote to someone the tool did not send to',
    );
  });

  it('gives the owner a correction, in every language', () => {
    for (const language of LANGUAGES) expect(DAY_ONE_NOTHING_SENT_LINE[language]).toBeTruthy();
    expect(DAY_ONE_NOTHING_SENT_LINE.ka).toContain('ჯერ არავისთვის მიმიწერია');
  });
});
