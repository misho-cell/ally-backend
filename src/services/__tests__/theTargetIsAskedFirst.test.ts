import { readFileSync } from 'fs';
import { join } from 'path';
import {
  askerWaitsLine,
  TARGET_HAS_AGREED_SQL,
  TargetAnswer,
  targetAnswerOf,
  targetChoices,
  targetQuestion,
} from '../targetConsent';

/**
 * #8945 (battery 5 Nov, case 6 ×3; the real Kurashvili case): the asker got a
 * member target's number before the target was asked.
 */
describe('#8945: a member target is asked first', () => {
  it('reads the two buttons in any language, and a plain yes', () => {
    for (const language of ['ka', 'en', 'ru', 'es'] as const) {
      const [yes, no] = targetChoices(language);
      expect(targetAnswerOf(yes)).toBe(TargetAnswer.Yes);
      expect(targetAnswerOf(no)).toBe(TargetAnswer.No);
    }
    expect(targetAnswerOf('კი')).toBe(TargetAnswer.Yes);
    expect(targetAnswerOf('ვინ არის ეს?')).toBeNull();
  });

  it('asks the target with who agreed, who wants to meet, and why', () => {
    const text = targetQuestion('ka', 'თორნიკე', 'ერეკლე', 'საქმიანი შეხვედრა');
    expect(text).toContain('თორნიკემ');
    expect(text).toContain('**ერეკლე**');
    expect(text).toContain('„საქმიანი შეხვედრა"');
  });

  it('tells the asker they wait for the target, never that a number came', () => {
    const line = askerWaitsLine('en', 'Tornike', 'Gigi');
    expect(line).toContain('I am asking Gigi now');
    expect(line).not.toMatch(/\d{6}/u);
  });

  it('hides the number everywhere until the target agrees', () => {
    const intro = readFileSync(join(__dirname, '..', 'introduction.service.ts'), 'utf8');
    const plans = readFileSync(join(__dirname, '..', 'taskPlans.service.ts'), 'utf8');
    expect(TARGET_HAS_AGREED_SQL).toBe(
      '(ir.target_asked_at IS NULL OR ir.target_said_yes IS TRUE)',
    );
    expect(intro.match(/\$\{TARGET_HAS_AGREED_SQL\}/gu)?.length).toBe(3);
    expect(plans).toContain('AND ${TARGET_HAS_AGREED_SQL}');
  });

  it('settles the answer once, on the target’s own thread, before any model run', () => {
    const intro = readFileSync(join(__dirname, '..', 'introduction.service.ts'), 'utf8');
    expect(intro).toContain(
      "WHERE ir.target_thread_id = $1 AND ir.target_answered_at IS NULL AND ir.status = 'accepted'",
    );
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'await answerTargetQuestion(userId, threadId, userMessage, runId, intent)',
    );
  });
});
