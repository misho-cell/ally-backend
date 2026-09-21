import { readFileSync } from 'fs';
import { join } from 'path';
import { INTRODUCTION_SHAPED, noteIntroductionSentAsAQuestion } from '../introductionShaped';

/**
 * Row 220's counter, read for the first time on 21 September — and the reading
 * was about the counter, not about the descriptions it was built to judge.
 *
 * Every string below is a real `task_asks.question` from production. The four
 * marked NEWLY CAUGHT are the ones the first version could not see; three of
 * the four came through the connector, where it was never called at all.
 */

/** Real wordings that ARE somebody asking to be connected. */
const INTRODUCTIONS = [
  'Would you introduce me to Netai Test 4?',
  "Could you introduce me to Netai Test 3, or connect us? I'd like to get in touch with him.",
  'Do you know Netai Test 5? Netai Test 3 would love an introduction if you two are connected — could you make that happen or put us in touch?',
  'შეგიძლია გამაცნო ნინო?',
  'გააცნობ ჩემს მეგობარს?',
  'იცნობ ნიკო ჯავახიშვილს ბრენდვაისიდან? დამაკავშირებდი მასთან?',
  'можешь познакомить меня с Ниной?',
  '¿Puedes presentarme a Nino?',
  // NEWLY CAUGHT — 2674, 3103, 3235, all three through the connector.
  'Netai Test 2 asks you to meet Netai Test 1, who would like to get in touch with you.',
  // NEWLY CAUGHT — 3202, chat, a real account asking a real contact outright
  // for a third person's details. The most consequential of the four and the
  // one the first version was furthest from seeing.
  'იცნობ კარგ კლოუნს ღონისძიებისთვის? თუ კი, გამომიგზავნე მისი საკონტაქტო.',
];

/**
 * Real wordings that are NOT — a recommendation, a name, a thank-you. Getting
 * these wrong is the cost of widening, so they are checked from the same base.
 */
const ORDINARY_QUESTIONS = [
  'Do you know a good plumber in Tbilisi?',
  'იცნობ სანდო ბუღალტერს?',
  'იცნობ სანდო მკერავს? ანას სჭირდება.',
  'Кто у тебя есть из электриков?',
  'Can you recommend a photographer for a wedding?',
  'Can you personally recommend a good dentist in Tbilisi? Netai Test 1 is looking for one.',
  'იცნობ კარგ, სანდო ღონისძიებების ორგანიზატორს თბილისში?',
  // „connecting us" is a thank-you AFTER the fact, and must not be counted as
  // a failure to create the introduction that plainly did happen.
  'Thank you for connecting us, really appreciate it!',
  'Thank you so much, really appreciate it, no need to reply to this.',
];

describe('the counter sees the introductions that actually went out', () => {
  it.each(INTRODUCTIONS)('counts: %s', (question) => {
    expect(INTRODUCTION_SHAPED.test(question)).toBe(true);
  });

  it.each(ORDINARY_QUESTIONS)('leaves alone: %s', (question) => {
    expect(INTRODUCTION_SHAPED.test(question)).toBe(false);
  });

  /**
   * `test` on a non-global regex is stateless, but this file shares ONE
   * exported instance across two surfaces and a stray /g would make every
   * second call a silent miss. Cheaper to assert than to discover.
   */
  it('is not stateful between calls', () => {
    const said = INTRODUCTIONS[0];
    expect(INTRODUCTION_SHAPED.test(said)).toBe(true);
    expect(INTRODUCTION_SHAPED.test(said)).toBe(true);
  });
});

describe('what it writes, and that it writes nothing else', () => {
  let logged: string[];
  let spy: jest.SpyInstance;

  beforeEach(() => {
    logged = [];
    spy = jest.spyOn(console, 'log').mockImplementation((line: unknown) => {
      logged.push(String(line));
    });
  });

  afterEach(() => spy.mockRestore());

  it('names the surface, so the connector half is not read as the whole', () => {
    noteIntroductionSentAsAQuestion(
      { surface: 'connector', taskId: 6931 },
      'Netai Test 2 asks you to meet Netai Test 1, who would like to get in touch with you.',
    );
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('[intro-as-ask] connector');
    expect(logged[0]).toContain('task 6931');
  });

  it('carries the wording, because the next decision has to read it', () => {
    noteIntroductionSentAsAQuestion(
      { surface: 'chat', runId: 'r1', threadId: 20032, taskId: 1 },
      'Could you introduce me to Netai Test 3?',
    );
    expect(logged[0]).toContain('run r1');
    expect(logged[0]).toContain('thread 20032');
    expect(logged[0]).toContain('Could you introduce me to Netai Test 3?');
  });

  it('says nothing for an ordinary question', () => {
    noteIntroductionSentAsAQuestion(
      { surface: 'chat', taskId: 1 },
      'Do you know a good plumber in Tbilisi?',
    );
    expect(logged).toHaveLength(0);
  });

  /** A counter that returns nothing cannot be branched on by accident. */
  it('returns nothing', () => {
    expect(
      noteIntroductionSentAsAQuestion({ surface: 'chat', taskId: 1 }, 'introduce me'),
    ).toBeUndefined();
  });
});

/**
 * The regression this file exists for: the counter shipped on ONE of the two
 * surfaces and reported the other one's traffic as a zero for a day. Comments
 * are stripped first — an earlier version of this trick passed against my own
 * documentation of the fix rather than against the fix.
 */
const code = (relative: string): string =>
  readFileSync(join(__dirname, '..', relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

describe('both surfaces call it', () => {
  it.each([
    ['chat', 'chat.service.ts'],
    ['connector', 'mcp/handlers.ts'],
  ])('%s does', (_surface, file) => {
    expect(code(file)).toContain('noteIntroductionSentAsAQuestion(');
  });

  /** Only on a send that succeeded — a refused ask connected nobody either way. */
  it('only when the ask was actually sent', () => {
    for (const file of ['chat.service.ts', 'mcp/handlers.ts']) {
      const source = code(file);
      const at = source.indexOf('noteIntroductionSentAsAQuestion(');
      expect(source.slice(Math.max(0, at - 200), at)).toContain('.sent === true');
    }
  });
});
