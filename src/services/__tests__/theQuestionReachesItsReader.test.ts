const create = jest.fn();
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create } },
}));
jest.mock('../costLedger.service', () => ({ __esModule: true, recordClaudeUsage: async () => {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { looksLikeATranslation, questionForReader } from '../askTranslation.service';

/**
 * ROW 254 — THE FRAME WAS BUILT IN THE READER'S LANGUAGE AND THE QUESTION
 * INSIDE IT WAS NOT.
 *
 * The night seat found it in their own stops: „Netai Test 3-ის ასისტენტი
 * გეკითხება: "Do you know a reliable electrician…"" — a Georgian frame around
 * an English question, because the asker wrote in English. One path over,
 * `goalQuestions.service` already tells the model to „translate if the
 * conversation is in another language".
 *
 * The founder's vision settles it without a new ruling: „the assistant conveys
 * its meaning to the other assistant, which speaks to its own user in a
 * suitable tone. Meaning, conditions and agreements must be preserved
 * accurately."
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE BEGINS WITH A CONFIGURATION AND NOT A TRANSLATION.
 *
 * The first cut of this row shipped at 09:48 with eleven passing assertions
 * below, and TRANSLATED NOTHING ALL DAY. It asked for `finalAnswerModel()` —
 * `CHAT_FINAL_ANSWER_MODEL`, an optional flag that is unset in production — so
 * every ask took the „no model" line and returned the asker's own words. The
 * ledger for the day: 157 openai calls on the variable that IS set, zero
 * `ask_translation` rows, ever.
 *
 * Every assertion below mocked the model PRESENT. Not one of them ran the
 * configuration the server is in, so all eleven passed on a version that could
 * not work. That is the fault this file now opens with, and the reason the
 * service runs on Anthropic — the provider that throws at boot when it is
 * missing, so „not configured" is not a state this path can be in.
 * ────────────────────────────────────────────────────────────────────────
 */
beforeEach(() => {
  jest.clearAllMocks();
  create.mockResolvedValue({ content: [{ type: 'text', text: 'თარგმანი' }], usage: {} });
});

describe('the configuration production is actually in', () => {
  const OPTIONAL_MODEL_FLAGS = [
    'CHAT_FINAL_ANSWER_MODEL',
    'SEARCH_QUERY_MODEL',
    'ASK_TRANSLATION_MODEL',
  ];

  /**
   * THE TEST THE FIRST CUT WOULD HAVE FAILED. With no optional model variable
   * set anywhere — which is this server today — a question that crosses a
   * language line must still reach its reader translated.
   */
  it('translates with every optional model flag unset', async () => {
    const saved = OPTIONAL_MODEL_FLAGS.map((name) => [name, process.env[name]] as const);
    for (const [name] of saved) delete process.env[name];
    try {
      jest.resetModules();
      const { questionForReader: fresh } = await import('../askTranslation.service');

      const out = await fresh('Do you know a reliable electrician?', 'ka');

      expect(create).toHaveBeenCalled();
      expect(out.text.startsWith('თარგმანი')).toBe(true);
      expect(out.skipped).toBeUndefined();
    } finally {
      for (const [name, value] of saved) if (value !== undefined) process.env[name] = value;
      jest.resetModules();
    }
  });

  /**
   * AND IT MUST NOT GO BACK. The behaviour above is one import away from being
   * hung off an off-by-default flag again, and the next person to reach for
   * „the model we use for the final answer" will not know this day happened.
   */
  it('does not depend on the optional second provider', () => {
    const source = readFileSync(join(__dirname, '..', 'askTranslation.service.ts'), 'utf8');
    // The IMPORTS and not the prose: the comment above them names both of these
    // on purpose, because what went wrong is the thing worth writing down.
    const imports = source.split('\n').filter((line) => line.startsWith('import '));

    expect(imports.join('\n')).not.toMatch(/finalAnswer\.service|config\/openai/);
    expect(imports.join('\n')).toContain("from '../config/anthropic'");
  });
});

describe('the same-language case spends nothing — the control', () => {
  it.each([
    ['ka', 'იცნობ კარგ ელექტრიკოსს?'],
    ['en', 'Do you know a reliable electrician?'],
  ])('%s to %s asks no model at all', async (language, question) => {
    const out = await questionForReader(question, language as 'ka' | 'en');

    expect(out.text).toBe(question);
    expect(out.skipped).toBe('same_language');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('a question in another language is translated for its reader', () => {
  it('puts the translation in front and keeps the original, labelled', async () => {
    const out = await questionForReader('Do you know a reliable electrician?', 'ka');

    expect(out.text.startsWith('თარგმანი')).toBe(true);
    expect(out.text).toContain('ორიგინალი');
    expect(out.text).toContain('Do you know a reliable electrician?');
    expect(out.original).toBe('Do you know a reliable electrician?');
  });

  /**
   * THE LABEL IS IN THE READER'S LANGUAGE TOO. „(original: …)" in English above
   * a Georgian translation is the same fault one layer down.
   */
  it.each([
    // Each answer is written in ITS OWN target's script, because since the
    // third cut one that is not is refused — and a fixture that could not
    // happen in production is how the first cut passed eleven tests.
    ['en', 'оригинал', 'original', 'Do you know a good electrician?'],
    ['ru', 'original', 'оригинал', 'Знаешь хорошего электрика?'],
  ])('labels it in %s', async (language, absent, present, answer) => {
    create.mockResolvedValue({ content: [{ type: 'text', text: answer }], usage: {} });

    const out = await questionForReader('იცნობ კარგ ელექტრიკოსს?', language as 'en' | 'ru');

    expect(out.text).toContain(present);
    expect(out.text).not.toContain(absent);
  });

  /** Meaning exact, tone free — the vision's own division, in the brief. */
  it('asks for the meaning to be kept and the tone to be human', async () => {
    await questionForReader('Do you know an electrician?', 'ka');

    const brief = String(create.mock.calls[0][0].system);
    expect(brief).toContain('Georgian');
    expect(brief).toContain('EXACTLY');
    expect(brief).toMatch(/Names, numbers, dates and places stay as they are/);
  });
});

describe('and it never loses the question', () => {
  /**
   * EVERY FAILURE RETURNS THE ASKER'S OWN WORDS, which is exactly the behaviour
   * before this file existed — so the worst this change can do is what already
   * happens. That is the whole reason it was safe to put in front of a real
   * message.
   */
  it('sends the original when the model throws', async () => {
    create.mockRejectedValue(new Error('down'));

    const out = await questionForReader('Do you know an electrician?', 'ka');

    expect(out.text).toBe('Do you know an electrician?');
    expect(out.skipped).toBe('failed');
    expect(out.original).toBeUndefined();
  });

  it('sends the original when the answer is empty', async () => {
    create.mockResolvedValue({ content: [{ type: 'text', text: '   ' }], usage: {} });

    const out = await questionForReader('Do you know an electrician?', 'ka');

    expect(out.text).toBe('Do you know an electrician?');
    expect(out.skipped).toBe('failed');
  });

  /**
   * AND AN ANSWER THAT IS THE ORIGINAL IS NOT A TRANSLATION. Labelling it
   * „(original: …)" underneath itself would tell the reader something untrue
   * about what they are looking at.
   */
  it('does not dress the original up as a translation of itself', async () => {
    create.mockResolvedValue({
      content: [{ type: 'text', text: 'Do you know an electrician?' }],
      usage: {},
    });

    const out = await questionForReader('Do you know an electrician?', 'ka');

    expect(out.text).toBe('Do you know an electrician?');
    expect(out.text).not.toContain('ორიგინალი');
  });

  it('leaves something far too long alone rather than paying to translate it', async () => {
    const huge = `Do you know an electrician? ${'x'.repeat(2000)}`;

    const out = await questionForReader(huge, 'ka');

    expect(out.text).toBe(huge);
    expect(out.skipped).toBe('too_long');
    expect(create).not.toHaveBeenCalled();
  });
});

/**
 * A CROSSED LANGUAGE LINE THAT WENT OUT UNTRANSLATED IS A LOGGED LINE.
 *
 * The first cut logged only its SUCCESSES, so a path that never succeeded once
 * wrote nothing at all, and eight hours of it looked exactly like the code not
 * being deployed. The event somebody would go looking for is the failure.
 */
describe('the failure is visible', () => {
  it('warns when the reader is handed a language they did not write in', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    create.mockRejectedValue(new Error('timeout'));
    try {
      await questionForReader('Do you know an electrician?', 'ka');

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('UNTRANSLATED'));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('en→ka'));
    } finally {
      warn.mockRestore();
    }
  });

  it('says nothing on the same-language case, which is most of them', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await questionForReader('იცნობ კარგ ელექტრიკოსს?', 'ka');

      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

/**
 * THE FIRST TWO TRANSLATIONS THAT EVER RAN, AS FIXTURES.
 *
 * They ran at 18:22 and 18:25 and they were bad. Both are here verbatim,
 * because a rule written from a description of a failure is a rule written
 * from my memory of it.
 */
describe('a mangled translation is worse than no translation', () => {
  const PICKUPS =
    'Just so you have it: the pickups would be Tuesday and Thursday mornings, in case that ' +
    'jogs anyone to mind. No need to reply unless someone comes to mind.';

  it('rejects the Korean word that arrived inside the Georgian (ask 4819)', async () => {
    create.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: '픽업ები იქნებოდა სამშაბათ და ხუთშაბათის დილით, თუ ეს ვინმეს გაახსენებს.',
        },
      ],
      usage: {},
    });

    const out = await questionForReader(PICKUPS, 'ka');

    expect(out.text).toBe(PICKUPS);
    expect(out.skipped).toBe('failed');
  });

  it('rejects the model’s own remarks appended to the answer (ask 4820)', async () => {
    const short = 'Thanks for the recommendation. Is Nino still the person?';
    create.mockResolvedValue({
      content: [
        {
          type: 'text',
          text:
            'მადლობა რეკომენდაციისთვის. ნინო კვლავ ის ადამიანია?\n\n' +
            'I cannot provide an accurate translation for this message because it appears to be ' +
            'a continuation of a previous conversation where a recommendation was made about ' +
            'someone, and I would need more context to render it faithfully for the reader.',
        },
      ],
      usage: {},
    });

    const out = await questionForReader(short, 'ka');

    expect(out.text).toBe(short);
    expect(out.skipped).toBe('failed');
  });

  it('lets an ordinary translation through, names and all', async () => {
    create.mockResolvedValue({
      content: [{ type: 'text', text: 'იცნობ კარგ ელექტრიკოსს? Nino გვირჩევს.' }],
      usage: {},
    });

    const out = await questionForReader('Do you know a good electrician? Nino recommends.', 'ka');

    expect(out.skipped).toBeUndefined();
    expect(out.text).toContain('ორიგინალი');
  });

  /**
   * THE SEAT'S OWN ADDITION (their 505), AND NOT AS A PHRASE LIST. A refusal
   * written in Latin is short and Latin is allowed inside a Georgian
   * translation, because names stay as they are — so it would have walked
   * past both of the other rules.
   */
  it('rejects a refusal with not one Georgian letter in it', async () => {
    create.mockResolvedValue({
      content: [{ type: 'text', text: 'I cannot translate this.' }],
      usage: {},
    });

    const out = await questionForReader('Do you know an electrician in Tbilisi?', 'ka');

    expect(out.text).toBe('Do you know an electrician in Tbilisi?');
    expect(out.skipped).toBe('failed');
  });

  /**
   * AND WHAT IT CANNOT DO, ON THE RECORD. „არ დაგვიწერთ პასუხი" is Georgian
   * letters, the right length, and the OPPOSITE of „no need to reply". The
   * wall is a wall against the two things checkable without a second opinion;
   * the strong model and the labelled original are what stand behind meaning,
   * and pretending otherwise is how the next one gets missed.
   */
  it('cannot catch an inverted meaning, and the test says so', () => {
    const inverted = 'არ დაგვიწერთ პასუხი, თუ ვინმე გაახსენდება.';

    expect(
      looksLikeATranslation(inverted, 'No need to reply unless someone comes to mind.', 'en', 'ka'),
    ).toEqual({
      ok: true,
    });
  });
});

/**
 * THE WIRE. Every assertion above holds the function; this project keeps
 * finding that the piece is tested from every angle and the line that calls it
 * is not.
 */
describe('the ask path actually uses it, where the frame is chosen', () => {
  const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');

  it('translates before composing, in the reader’s language', () => {
    expect(asks).toContain('const relayed = await questionForReader(safeQuestion, language);');
  });

  it('puts the relayed text in the opening rather than the raw question', () => {
    const at = asks.indexOf('const opening = buildAskOpening(');
    const call = asks.slice(at, at + 260);

    expect(call).toContain('relayed.text');
    expect(call).not.toContain('safeQuestion');
  });

  /**
   * AND THE STORED QUESTION STAYS THE ASKER'S OWN WORDS. `task_asks.question`
   * is what every later read — the answer, the chase, the admin — treats as
   * what was asked. A translation there would quietly become the record.
   */
  it('stores the asker’s own words, not the translation', () => {
    const at = asks.indexOf('INSERT INTO task_asks');
    expect(asks.slice(at, at + 700)).toContain('safeQuestion');
  });
});

/**
 * AND EVERY OTHER WIRE THAT QUOTES A PERSON, NAMED BY FILENAME.
 *
 * The first cut fixed the ask and stopped there, because the ask is where the
 * row was found. Reading the three places that put „…" around somebody's own
 * sentence turned up the introduction path doing the identical thing:
 *
 *   incomingRequestOpening  „Their message: „…""    threads.service
 *   introAcceptedOpening    „their reason: „…""     introduction.service
 *   introOutcomeLine        „Their answer: „…""     introduction.service
 *
 * Each frame is built in the reader's language, and each quotes a sentence
 * written by somebody who need not share it. A shared helper does not fix the
 * one-wire fault by existing — it fixes it on the wires that call it, so each
 * one is asserted here by the file it lives in.
 */
describe('every wire that quotes a person translates for the reader', () => {
  const read = (file: string): string => readFileSync(join(__dirname, '..', file), 'utf8');

  it('the introduction request: the mediator reads the requester’s message', () => {
    const source = read('threads.service.ts');
    const at = source.indexOf('incomingRequestOpening(language');

    expect(source).toContain("await relayedForReader(message, language, 'request')");
    expect(source.slice(at, at + 200)).toContain('relayed?.text ?? message');
  });

  it('the accepted introduction: the target reads the requester’s reason', () => {
    const source = read('introduction.service.ts');
    const at = source.indexOf('introAcceptedOpening(');

    expect(source).toContain("await relayedForReader(why, language, 'request')");
    expect(source.slice(at, at + 220)).toContain('relayed?.text ?? why');
  });

  it('the outcome: the requester reads the answer they were given', () => {
    const source = read('introduction.service.ts');
    const at = source.indexOf('return introOutcomeLine(');

    expect(source).toContain("await relayedForReader(said, language, 'answer')");
    expect(source.slice(at, at + 220)).toContain('relayed?.text ?? said');
  });

  /**
   * AND NOTHING IS PAID FOR A PERSON WHO WROTE NOTHING. All three of these are
   * optional — most introduction requests carry no message at all — so the
   * null case must not reach a model call.
   */
  it('asks no model when there is no sentence to translate', () => {
    for (const [file, guard] of [
      ['threads.service.ts', 'message === null ? null :'],
      ['introduction.service.ts', 'why === null ? null :'],
      ['introduction.service.ts', 'said === null ? null :'],
    ] as const) {
      expect(read(file)).toContain(guard);
    }
  });
});
