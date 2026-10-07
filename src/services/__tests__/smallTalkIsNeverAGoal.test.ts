import { readFileSync } from 'fs';
import { join } from 'path';
import { isSmallTalk, isToolFreeSmallTalk } from '../smallTalk';
import { seeksAPerson } from '../goalIntent';
import { smallTalkTurn } from '../chat.service';

/**
 * The tester's 1113 (the founder's account, 18:43–18:46Z): „გამარჯობა" and „რა
 * დღეა დღეს?" typed after „+ ახალი მიზანი" became goals 15676 and 15677.
 */
describe('small talk', () => {
  it.each([
    'გამარჯობა',
    'რა დღეა დღეს?',
    'რომელი საათია?',
    'როგორ ხარ?',
    'მადლობა!',
    'What day is it today?',
    'How are you?',
    'Thank you',
    'Как дела?',
    'კარგად ხარ?',
    'ნახვამდის',
    'ნახვამდის!',
    'კარგად იყავი',
    'ღამე მშვიდობისა',
    'Bye',
    'Goodbye!',
  ])('„%s" is small talk', (line) => {
    expect(isSmallTalk(line)).toBe(true);
  });

  it.each([
    'ვინ იცნობს კარგ ვეტერინარს?',
    'მჭირდება ბუღალტერი',
    'რა დღეა დღეს? და ვინ იცნობს ნოტარიუსს?',
    'Who knows a good dentist?',
    'ფოტოგრაფი',
    'კარგად',
    'ნახვამდის, და ხვალ ნოტარიუსი მომიძებნე',
  ])('„%s" is not', (line) => {
    expect(isSmallTalk(line)).toBe(false);
  });

  it('opens no goal, whatever button it was typed after', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const gate = chat.indexOf('if (isSmallTalk(userMessage)) {');
    const flag = chat.indexOf('const flaggedNeed =');
    expect(gate).toBeGreaterThan(-1);
    expect(flag).toBeGreaterThan(gate);
  });
});

/** The tester's 1114: the list missed the next wording; the flag alone no longer opens a goal. */
describe('the new-goal flag', () => {
  it('needs a stated need, and a short line answered with no tool gets no waiting list', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('if (!flaggedNeed && !looksLikeGoalRequest(userMessage)) {');
    expect(chat).toContain('const smallTalk = smallTalkTurn(ownerAbsent, userMessage, pending);');
  });
});

/** The tester's 1114 (34585, 34587, 34590): titles that refused or misnamed a greeting. */
describe('a small-talk conversation’s title', () => {
  it('is its own words, with no title model', () => {
    const title = readFileSync(join(__dirname, '..', 'threadTitle.service.ts'), 'utf8');
    const at = title.indexOf('if (isSmallTalk(firstMessage)) {');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(title.indexOf("await import('../config/anthropic')"));
  });
});

/** The tester's 1116: small talk bound to an old goal of the same words, and a hello in a goal. */
describe('small talk and open goals', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('names no goal by title', () => {
    expect(chat).toContain(
      '!isSmallTalk(userMessage)\n      ? await findOpenTaskNamedIn(userId, userMessage)',
    );
  });

  it('greets from the server inside a goal too, and gets no waiting block after tools', () => {
    expect(chat).toContain('if (!ownerAbsent && isBareGreeting(userMessage)) {');
    expect(chat).toContain('if (isSmallTalk(userMessage)) return true;');
  });
});

describe('what counts as a small-talk turn for the waiting list', () => {
  const noTools: never[] = [];
  it('is a listed line or a short question, never a short answer like „კი"', () => {
    expect(smallTalkTurn(false, 'როგორ ხარ?', noTools)).toBe(true);
    expect(smallTalkTurn(false, 'ორჯერ ორი რამდენია?', noTools)).toBe(true);
    expect(smallTalkTurn(false, 'კი', noTools)).toBe(false);
    expect(smallTalkTurn(false, 'ბათუმში', noTools)).toBe(false);
    expect(smallTalkTurn(true, 'როგორ ხარ?', noTools)).toBe(false);
  });
});

/** The tester's 1117 (34765): the control „who knows a good vet?" after the new-goal button. */
describe('asking who knows someone', () => {
  it('is a need on the flagged path', () => {
    expect(seeksAPerson('ვინ იცნობს კარგ ვეტერინარს?')).toBe(true);
    expect(seeksAPerson('Does anyone know a good dentist?')).toBe(true);
    expect(seeksAPerson('რა დღეა დღეს?')).toBe(false);
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('(statesANeed(userMessage) || seeksAPerson(userMessage))');
  });
});

/** The tester's 1131 (rows 1 and 2): small talk was slow and „მადლობა" ran the inbox. */
describe('small talk answered with no tools', () => {
  it.each(['მადლობა', 'როგორ ხარ?', 'რა დღეა დღეს?', 'Thank you', 'How are you?'])(
    '„%s" needs no tool',
    (line) => {
      expect(isToolFreeSmallTalk(line)).toBe(true);
    },
  );

  it('the weather still gets its look-up', () => {
    expect(isToolFreeSmallTalk('რა ამინდია?')).toBe(false);
  });

  it('a need is never small talk', () => {
    expect(isToolFreeSmallTalk('ვინ იცნობს კარგ ვეტერინარს?')).toBe(false);
  });

  it('runs the first turn text-only, short', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      "const smallTalkOnly = !ownerAbsent && isToolFreeSmallTalk(lastOwnerText(messages) ?? '');",
    );
    expect(chat).toContain(
      '...((otherTap || smallTalkOnly) && { forceText: true, maxTokens: GREETING_MAX_TOKENS }),',
    );
  });
});
