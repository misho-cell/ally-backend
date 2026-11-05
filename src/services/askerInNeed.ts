import { geoName } from './georgianCase';
import { georgianScriptName } from './georgianScriptName';
import { RunLanguage } from './runLanguage';

/**
 * #5249 full loop (the tester's 68882, 60633): the owner wrote „მომწერე ზურაბს:
 * 3 კვირაა ბიზნეს სესხზე განაცხადი მაქვს…" and Zurab received „სალამი, ზურაბს
 * სჭირდება დახმარება, 3 კვირაა…" — his own name as the one with the problem.
 * The first person was turned into a third person, under the reader's name.
 * When the question to the reader makes the reader the one in need, the asker's
 * name stands there instead. Nothing else in the question is touched.
 *
 * Tester 82842 (thread 80192): „ანა ლომიძეს სახლის პროექტისთვის კარგი
 * არქიტექტორი სჭირდება" reached Ana — saved as „Ana Lomidze", in Latin letters,
 * and with her surname and other words between the name and „სჭირდება". The
 * reader's name is matched in Georgian script, with the surname, anywhere
 * before „სჭირდება" in the same sentence.
 */
const GEORGIAN_NEEDS = 'სჭირდება';
const ENGLISH_NEEDS_RE = '\\s+(needs|is\\s+looking\\s+for)\\b';
/** Georgian letters, so a name is matched as a whole word. */
const NOT_A_GEORGIAN_LETTER = '(?<![\\u10D0-\\u10FF])';
/** A name word ends in its closing vowel and the dative „-ს" at most: „ზურაბიჩს" is no „ზურაბ". */
const GEORGIAN_WORD_TAIL = '[აეიოუ]?ს?(?![\\u10D0-\\u10FF])';
/** The rest of the same sentence, up to the verb. */
const SAME_SENTENCE_BEFORE = '(?=\\s+[^.!?\\n]*';
/** Georgian puts the dative „-ს" on the last word of a name: „ანა ლომიძეს". */
const GEORGIAN_DATIVE_END = 'ს';
const CLOSING_VOWEL_RE = /[აეიოუ]$/u;
/** Shorter name stems match too much of any word. */
const MIN_STEM = 2;

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** The first word of a name, without the nominative „-ი" Georgian adds to a consonant stem. */
function nameBase(name: string): string {
  const first = name.trim().split(/\s+/u)[0] ?? '';
  return first.length > 3 && first.endsWith('ი') ? first.slice(0, -1) : first;
}

/** The reader's name in a Georgian sentence: first name, then the surname if written. */
function georgianReaderPattern(readerName: string): string | null {
  const [first, surname] = georgianScriptName(readerName).split(/\s+/u);
  const firstBase = nameBase(first ?? '');
  if (firstBase.length < MIN_STEM) return null;
  const surnameStem = (surname ?? '').replace(CLOSING_VOWEL_RE, '');
  const surnamePart =
    surnameStem.length >= MIN_STEM ? `(?:\\s+${escapeRe(surnameStem)}${GEORGIAN_WORD_TAIL})?` : '';
  return `${NOT_A_GEORGIAN_LETTER}${escapeRe(firstBase)}${GEORGIAN_WORD_TAIL}${surnamePart}`;
}

function georgianWithAsker(question: string, readerName: string, asker: string): string {
  const reader = georgianReaderPattern(readerName);
  if (reader === null) return question;
  const re = new RegExp(`${reader}${SAME_SENTENCE_BEFORE}${GEORGIAN_NEEDS})`, 'u');
  return question.replace(re, (named) =>
    named.endsWith(GEORGIAN_DATIVE_END) ? geoName(asker, 'dat') : named,
  );
}

export function withAskerAsTheOneInNeed(
  question: string,
  readerName: string | null,
  askerName: string | null,
  language: RunLanguage,
): string {
  const base = nameBase(readerName ?? '');
  const asker = askerName?.trim() ?? '';
  if (base === '' || asker === '') return question;
  if (language === 'ka') return georgianWithAsker(question, readerName ?? '', asker);
  const re = new RegExp(`\\b${escapeRe(base)}${ENGLISH_NEEDS_RE}`, 'iu');
  return question.replace(re, (_whole, verb: string) => `${asker} ${verb}`);
}
