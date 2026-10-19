import { geoName } from './georgianCase';
import { RunLanguage } from './runLanguage';

/**
 * #5249 full loop (the tester's 68882, 60633): the owner wrote „მომწერე ზურაბს:
 * 3 კვირაა ბიზნეს სესხზე განაცხადი მაქვს…" and Zurab received „სალამი, ზურაბს
 * სჭირდება დახმარება, 3 კვირაა…" — his own name as the one with the problem.
 * The first person was turned into a third person, under the reader's name.
 * When the question to the reader makes the reader the one in need, the asker's
 * name stands there instead. Nothing else in the question is touched.
 */
const GEORGIAN_NEEDS = 'სჭირდება';
const ENGLISH_NEEDS_RE = '\\s+(needs|is\\s+looking\\s+for)\\b';
/** Georgian letters, so a name is matched as a whole word. */
const NOT_A_GEORGIAN_LETTER = '(?<![\\u10D0-\\u10FF])';

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** The first word of a name, without the nominative „-ი" Georgian adds to a consonant stem. */
function nameBase(name: string): string {
  const first = name.trim().split(/\s+/u)[0] ?? '';
  return first.length > 3 && first.endsWith('ი') ? first.slice(0, -1) : first;
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
  if (language === 'ka') {
    const re = new RegExp(
      `${NOT_A_GEORGIAN_LETTER}${escapeRe(base)}(?:ი?ს)\\s+${GEORGIAN_NEEDS}`,
      'u',
    );
    return question.replace(re, `${geoName(asker, 'dat')} ${GEORGIAN_NEEDS}`);
  }
  const re = new RegExp(`\\b${escapeRe(base)}${ENGLISH_NEEDS_RE}`, 'iu');
  return question.replace(re, (_whole, verb: string) => `${asker} ${verb}`);
}
