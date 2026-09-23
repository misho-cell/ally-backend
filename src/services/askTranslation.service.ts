import Anthropic from '@anthropic-ai/sdk';

import anthropic from '../config/anthropic';
import { recordClaudeUsage } from './costLedger.service';
import { detectRunLanguage, RunLanguage } from './runLanguage';

/**
 * ROW 254 — A QUESTION REACHED ITS READER IN A LANGUAGE THEY HAD NOT WRITTEN A
 * WORD OF, INSIDE A FRAME CAREFULLY BUILT IN THEIRS.
 *
 * The night seat found it in their own 00:03 stops: on a Georgian-framed ask
 * thread the question itself sat in English —
 *
 *   „Netai Test 3-ის ასისტენტი გეკითხება: "Do you know a reliable
 *    electrician…""
 *
 * — because the asker had written in English. The FRAME is the recipient's
 * deliberately (`openAskThread` takes their language and its comment says why:
 * „the caption above this thread is the first thing they see of it"). The
 * QUESTION was the asker's own words, scrubbed for numbers and nothing else.
 *
 * THE FOUNDER'S VISION DECIDES IT, so this needed no new ruling. „Each person
 * speaks to their own assistant … the assistant conveys its meaning to the
 * other assistant, which speaks to its own user in a suitable tone. Meaning,
 * conditions and agreements must be preserved accurately. Wording and tone can
 * be adapted to the recipient." Translate for the reader; keep the meaning
 * exact.
 *
 * THE ORIGINAL IS ALWAYS KEPT AND ALWAYS LABELLED. „Preserved accurately" is
 * not something a translation can promise about itself — the reader must be
 * able to see what was actually said, and a helper who speaks both languages
 * is the person most likely to notice a translation that drifted.
 *
 * AND THE SAME-LANGUAGE CASE SPENDS NOTHING. Most asks here are Georgian to
 * Georgian. A version that pays for a model call on those is a version that
 * fails on price however good the translations are, so the languages are
 * compared first and nothing is called on an identical pair.
 *
 * ────────────────────────────────────────────────────────────────────────
 * SECOND CUT, 23 September 18:00 — THE FIRST VERSION NEVER RAN ONCE IN
 * PRODUCTION, AND NOTHING SAID SO.
 *
 * It shipped at 09:48 and the seat still saw untranslated questions at 13:53
 * (ask 4555, a Georgian frame around an English question) and again at 17:47.
 * The reason is in the version it replaces: the model it asked for was
 * `finalAnswerModel()` — `CHAT_FINAL_ANSWER_MODEL`, an OPTIONAL flag whose own
 * file says „unset = the product behaves exactly as it did before this file
 * existed". It is unset here. So every ask took the `no_model` line, returned
 * the asker's words, and said nothing.
 *
 * MEASURED BEFORE REBUILDING, the whole ledger for the day:
 *
 *     openai · search_query     157      ← SEARCH_QUERY_MODEL is set
 *     openai · chat               0      ← CHAT_FINAL_ANSWER_MODEL is not
 *     *      · ask_translation     0      ← so this never fired, not once
 *
 * TWO FAULTS, AND THE SECOND IS THE ONE WORTH KEEPING ON THE BOARD:
 *
 * 1. A NEW BEHAVIOUR WAS HUNG OFF AN OFF-BY-DEFAULT FLAG. It now runs on
 *    Anthropic Haiku, like every other small utility call in this codebase
 *    (moderation, thread titles, fact extraction, `ask_boundary`). Anthropic
 *    is load-bearing — `config/anthropic` THROWS at boot without a key — so
 *    „is the model configured" is not a question this path can lose on. The
 *    env override keeps the house shape: a name to change the model with, and
 *    a default that works the day it deploys.
 *
 * 2. THE FAILURE WAS SILENT. The only log line was on SUCCESS, so a path that
 *    never succeeded wrote nothing, and eight hours of evidence looked
 *    identical to the code not being deployed. A question that crosses a
 *    language line and goes out untranslated is now a logged line every time,
 *    with the reason — because that is the event somebody is looking for.
 *
 * 📌 The tests are what let it through, and they were thorough about the wrong
 * thing: eleven assertions, every one of them with the model MOCKED PRESENT.
 * Not one asked what happens in the configuration production is actually in.
 * `theQuestionReachesItsReader.test.ts` now runs that configuration first.
 * ────────────────────────────────────────────────────────────────────────
 */

/** Small: this sits in front of a message somebody is waiting for. */
const TRANSLATE_BUDGET_MS = 6_000;

/** A question plus its translation. Short, and one language of it is given. */
const MAX_OUTPUT_TOKENS = 1_024;

/**
 * A question is short. Longer than this and something other than a question
 * has arrived, and a translation of it is not what fixes that.
 */
const MAX_QUESTION_CHARS = 1_200;

/**
 * The house small-model shape: overridable by name, and a default that works
 * on the deploy that carries it. The variable exists so the model can be
 * corrected without a release — NOT so the feature can be off.
 */
const TRANSLATE_MODEL = process.env.ASK_TRANSLATION_MODEL?.trim() || 'claude-sonnet-5';

const LANGUAGE_NAMES: Readonly<Record<RunLanguage, string>> = {
  ka: 'Georgian',
  en: 'English',
  ru: 'Russian',
  es: 'Spanish',
};

/**
 * WHAT THE TEXT IS, in the brief — three kinds because three wires carry one
 * person's own words to another person who need not read that language:
 *
 *     question   the ask itself                    `taskAsks.service`
 *     request    „why I would like to meet you"    the introduction request,
 *                                                  and the reason on the yes
 *     answer     what the helper wrote back        the introduction outcome
 *
 * The ask path was the one the row was opened on and the only one fixed in the
 * first cut. The introduction path has the identical shape — a frame built
 * carefully in the reader's language with somebody else's sentence quoted
 * inside it — and finding it needed nothing but reading the three places that
 * quote a person.
 */
export type RelayedKind = 'question' | 'request' | 'answer';

const WHAT_IT_IS: Readonly<Record<RelayedKind, string>> = {
  question: 'It is one person asking another for help, relayed by their assistants.',
  request:
    'It is one person saying why they would like to meet another, relayed by their assistants.',
  answer: 'It is one person answering another person’s request, relayed by their assistants.',
};

/**
 * MEANING EXACT, TONE FREE — the vision's own division, in the brief.
 *
 * It is told what the text IS, because a question relayed between two people's
 * assistants is not a document: „can you do Thursday" must come out as
 * something a person says, not as a formal rendering of it.
 */
function brief(to: RunLanguage, what: RelayedKind): string {
  return [
    `Translate the message into ${LANGUAGE_NAMES[to]}.`,
    '',
    WHAT_IT_IS[what],
    '',
    '- Keep the MEANING, the conditions and anything agreed EXACTLY.',
    '- Names, numbers, dates and places stay as they are.',
    '- Match how a person actually speaks; do not make it formal.',
    '- Answer with the translation ALONE. No quotes, no notes, no explanation.',
    '- If you cannot translate it, answer with the original text unchanged.',
  ].join('\n');
}

/**
 * ────────────────────────────────────────────────────────────────────────
 * THIRD CUT, 18:32, FOUR MINUTES AFTER THE FIRST TWO TRANSLATIONS EVER RAN.
 *
 * They ran. They were also BAD, in two different ways, and I read them before
 * the seat did only because I went looking the moment the ledger moved:
 *
 *   ask 4819, into Georgian, from „…the pickups would be Tuesday and Thursday
 *   mornings… No need to reply unless someone comes to mind."
 *
 *       „픽업ები იქნებოდა სამშაბათ და ხუთშაბათის დილით…
 *        არ დაგვიწერთ პასუხი, თუ ვინმე გაახსენდება."
 *
 *   — a KOREAN word spliced into the Georgian, and the last clause INVERTED:
 *   „do not write to us if somebody comes to mind" is the opposite of what
 *   was asked.
 *
 *   ask 4820, into Georgian: „ფблагодарность…" — Georgian and Russian fused
 *   into one word — followed by a paragraph of the model talking to itself in
 *   English: „I cannot provide an accurate translation for this message
 *   because…", delivered to the reader as if it were part of the question.
 *
 * A MANGLED TRANSLATION IS WORSE THAN NO TRANSLATION, and that is the whole
 * ruling here. The untranslated original carries the exact meaning and the
 * reader can do something with it; „do not reply" in place of „no need to
 * reply" changes what a person is being asked, in their own language, with
 * our name on it.
 *
 * SO TWO CHANGES, AND THE SECOND IS THE ONE THAT HOLDS:
 *
 * 1. The model is the strong one, not Haiku. These are rare and short — 2
 *    calls in the first hour — and this text goes in front of a stranger doing
 *    somebody a favour.
 * 2. A WALL THAT DOES NOT DEPEND ON THE MODEL BEHAVING. Every answer must be
 *    written in the reader's script (plus the asker's, for names, and plus
 *    Latin and digits), and must not be wildly longer than what was sent. A
 *    letter from a script belonging to neither language is not a translation,
 *    whatever else it is, and three times the length is a model adding its
 *    own remarks. Both failures above are caught by those two rules, and
 *    neither rule asks a model whether it did well.
 *
 * WHAT IT CANNOT DO IS CHECK MEANING. „არ დაგვიწერთ" is Georgian letters, the
 * right length, and wrong. The script wall would NOT have caught the inversion
 * on its own — the strong model and the labelled original are what stand
 * behind that one, and the original is the reason a wrong translation can be
 * seen rather than believed. I would rather write that down than imply this
 * fixes it.
 * ────────────────────────────────────────────────────────────────────────
 */

/** Beyond this multiple of the original, the model has added something. */
const MAX_LENGTH_RATIO = 3;

const SCRIPTS: Readonly<Record<RunLanguage, RegExp>> = {
  ka: /[Ⴀ-ჿ]/u,
  ru: /[Ѐ-ӿ]/u,
  en: /[A-Za-z]/u,
  es: /[A-Za-z]/u,
};

/** Letters that belong to no language here: CJK, Hangul, Arabic, Hebrew, … */
function lettersOutside(text: string, allowed: readonly RegExp[]): string[] {
  return [...text].filter((ch) => {
    if (!/\p{L}/u.test(ch)) return false;
    if (/[A-Za-z]/u.test(ch)) return false; // names, brands, the Latin alphabet
    return !allowed.some((script) => script.test(ch));
  });
}

/**
 * Is this a translation at all? Nothing here judges how GOOD it is — these are
 * the two things that can be known without a second opinion.
 */
export function looksLikeATranslation(
  translated: string,
  original: string,
  from: RunLanguage,
  to: RunLanguage,
): { ok: true } | { ok: false; why: string } {
  const strays = lettersOutside(translated, [SCRIPTS[to], SCRIPTS[from]]);
  if (strays.length > 0) {
    return { ok: false, why: `letters from another script: ${[...new Set(strays)].join('')}` };
  }
  if (translated.length > original.length * MAX_LENGTH_RATIO) {
    return { ok: false, why: `${translated.length} chars for an original of ${original.length}` };
  }
  return { ok: true };
}

export interface RelayedQuestion {
  /** What goes in front of the reader. The original when nothing was translated. */
  readonly text: string;
  /** The asker's words, present only when a translation happened. */
  readonly original?: string;
  /** For the log: why no translation, when there is none. */
  readonly skipped?: 'same_language' | 'too_long' | 'failed';
}

/** „(original: …)" in the reader's own language, so the label is readable too. */
function labelled(translation: string, original: string, to: RunLanguage): string {
  switch (to) {
    case 'en':
      return `${translation}\n\n(original: ${original})`;
    case 'ru':
      return `${translation}\n\n(оригинал: ${original})`;
    case 'es':
      return `${translation}\n\n(original: ${original})`;
    default:
      return `${translation}\n\n(ორიგინალი: ${original})`;
  }
}

/**
 * A CROSSED LANGUAGE LINE THAT WAS NOT TRANSLATED IS AN EVENT, NOT A NON-EVENT.
 *
 * This is the line whose absence cost the row a day: the reader is about to be
 * handed words in a language they have not written in, and the only place that
 * can be seen from is here.
 */
function untranslated(from: RunLanguage, to: RunLanguage, what: RelayedKind, why: string): void {
  // eslint-disable-next-line no-console
  console.warn(`[ask-relay] ${from}→${to} ${what} sent UNTRANSLATED: ${why}`);
}

/**
 * One person's own words as the reader should see them.
 *
 * NEVER THROWS AND NEVER LOSES THE WORDS. Every failure returns the original,
 * which is exactly the behaviour before this file — so the worst this can do
 * is what already happened.
 */
export async function relayedForReader(
  question: string,
  readerLanguage: RunLanguage,
  what: RelayedKind = 'question',
): Promise<RelayedQuestion> {
  const text = question.trim();
  if (text === '') return { text: question };

  // The control, and it runs before anything is built or charged.
  const asked = detectRunLanguage(text);
  if (asked === readerLanguage) return { text: question, skipped: 'same_language' };

  if (text.length > MAX_QUESTION_CHARS) {
    untranslated(
      asked,
      readerLanguage,
      what,
      `${text.length} chars, over the ${MAX_QUESTION_CHARS} cap`,
    );
    return { text: question, skipped: 'too_long' };
  }

  try {
    const response = await anthropic.messages.create(
      {
        model: TRANSLATE_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: brief(readerLanguage, what),
        messages: [{ role: 'user', content: text }],
      },
      { timeout: TRANSLATE_BUDGET_MS },
    );
    void recordClaudeUsage({
      userId: null,
      kind: 'ask_translation',
      model: TRANSLATE_MODEL,
      usage: response.usage,
    }).catch(() => {});

    const translated = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
    // An empty answer, or one that came back as the original, is not a
    // translation and must not be dressed up as one with a label.
    if (translated === '' || translated === text) {
      untranslated(asked, readerLanguage, what, 'the model returned nothing new');
      return { text: question, skipped: 'failed' };
    }
    const sane = looksLikeATranslation(translated, text, asked, readerLanguage);
    if (!sane.ok) {
      untranslated(asked, readerLanguage, what, `rejected — ${sane.why}`);
      return { text: question, skipped: 'failed' };
    }
    return { text: labelled(translated, text, readerLanguage), original: text };
  } catch (error) {
    untranslated(
      asked,
      readerLanguage,
      what,
      error instanceof Error ? error.message : 'model error',
    );
    return { text: question, skipped: 'failed' };
  }
}

/**
 * The ask path's name for it, kept because that path is the row's own and its
 * wire test names this line character for character.
 */
export async function questionForReader(
  question: string,
  readerLanguage: RunLanguage,
): Promise<RelayedQuestion> {
  return relayedForReader(question, readerLanguage, 'question');
}
