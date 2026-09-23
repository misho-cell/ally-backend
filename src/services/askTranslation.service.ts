import { openaiClient } from '../config/openai';
import { finalAnswerModel, toLedgerUsage } from './finalAnswer.service';
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
 * There was no translation step anywhere in the ask path, AND NO COMMENT SAYING
 * THERE SHOULD NOT BE — every other deliberate choice in that file is argued in
 * place, so the absence read as nobody having decided rather than somebody
 * deciding against.
 *
 * THE PRODUCT ALREADY SAID THE OPPOSITE ONE PATH OVER: `goalQuestions.service`
 * instructs the model to relay a question „verbatim (translate if the
 * conversation is in another language)". The intent was written down — in the
 * prompt for the neighbouring path, not in the code for this one.
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
 * compared first and an identical pair returns before any client is built.
 * That control is part of the row's done-when, agreed with the seat at 01:43,
 * not something to verify afterwards.
 */

/** Small: this sits in front of a message somebody is waiting for. */
const TRANSLATE_BUDGET_MS = 6_000;

/**
 * A question is short. Longer than this and something other than a question
 * has arrived, and a translation of it is not what fixes that.
 */
const MAX_QUESTION_CHARS = 1_200;

const LANGUAGE_NAMES: Readonly<Record<RunLanguage, string>> = {
  ka: 'Georgian',
  en: 'English',
  ru: 'Russian',
  es: 'Spanish',
};

/**
 * MEANING EXACT, TONE FREE — the vision's own division, in the brief.
 *
 * It is told what the text IS, because a question relayed between two people's
 * assistants is not a document: „can you do Thursday" must come out as
 * something a person says, not as a formal rendering of it.
 */
function brief(to: RunLanguage): string {
  return [
    `Translate the message into ${LANGUAGE_NAMES[to]}.`,
    '',
    'It is one person asking another for help, relayed by their assistants.',
    '',
    '- Keep the MEANING, the conditions and anything agreed EXACTLY.',
    '- Names, numbers, dates and places stay as they are.',
    '- Match how a person actually speaks; do not make it formal.',
    '- Answer with the translation ALONE. No quotes, no notes, no explanation.',
    '- If you cannot translate it, answer with the original text unchanged.',
  ].join('\n');
}

export interface RelayedQuestion {
  /** What goes in front of the reader. The original when nothing was translated. */
  readonly text: string;
  /** The asker's words, present only when a translation happened. */
  readonly original?: string;
  /** For the log: why no translation, when there is none. */
  readonly skipped?: 'same_language' | 'too_long' | 'no_model' | 'failed';
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
 * The question as the reader should see it.
 *
 * NEVER THROWS AND NEVER LOSES THE QUESTION. Every failure returns the asker's
 * own words, which is exactly today's behaviour — so the worst this can do is
 * what already happens.
 */
export async function questionForReader(
  question: string,
  readerLanguage: RunLanguage,
): Promise<RelayedQuestion> {
  const text = question.trim();
  if (text === '') return { text: question };

  // The control, and it runs before anything is built or charged.
  if (detectRunLanguage(text) === readerLanguage) {
    return { text: question, skipped: 'same_language' };
  }
  if (text.length > MAX_QUESTION_CHARS) return { text: question, skipped: 'too_long' };

  const model = finalAnswerModel();
  const client = openaiClient();
  if (model === '' || client === null) return { text: question, skipped: 'no_model' };

  try {
    const completion = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: 'system', content: brief(readerLanguage) },
          { role: 'user', content: text },
        ],
      },
      { timeout: TRANSLATE_BUDGET_MS },
    );
    void recordClaudeUsage({
      userId: 'ask-relay',
      kind: 'ask_translation',
      model,
      provider: 'openai',
      usage: toLedgerUsage(completion.usage),
    }).catch(() => {});

    const translated = (completion.choices[0]?.message?.content ?? '').trim();
    // An empty answer, or one that came back as the original, is not a
    // translation and must not be dressed up as one with a label.
    if (translated === '' || translated === text) return { text: question, skipped: 'failed' };
    return { text: labelled(translated, text, readerLanguage), original: text };
  } catch {
    return { text: question, skipped: 'failed' };
  }
}
