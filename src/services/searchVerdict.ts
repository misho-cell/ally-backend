import { SearchOutcome } from './searchOutcome.service';

/**
 * 2810 (MASTER TEST RUN AD-015, 8 Oct, 2 of 2): the owner answered a search
 * with „კი, ზუსტად ეს მჭირდებოდა, მადლობა." and the search stayed without an
 * outcome — the model never calls record_search_outcome, so „successful
 * searches" read 0 of 7,588. The server reads the owner's own next line.
 *
 * Deliberately narrow. The reply to a search often ends with another question
 * (the day's contact question, T2181), so a bare „კი" may answer that one: an
 * acceptance needs a word that is about the result itself, or a yes together
 * with thanks. Anything else records nothing.
 */
const MAX_VERDICT_CHARS = 120;
const QUESTION_RE = /[?？]/u;
const EXACTLY_RE =
  /ზუსტად|სწორედ|ეს მჭირდებოდა|ის მჭირდებოდა|\bexactly\b|just what i needed|that'?s (?:who|what) i needed|\bperfect\b/iu;
const YES_RE = /^(?:კი|კარგი|დიახ|ჰო|yes|great|ok(?:ay)?)(?![\p{L}])/iu;
const THANKS_RE = /მადლობ|გმადლობ|\bthank/iu;
const REFUSED_RE =
  /არ მჭირდებოდა|ეს არ არის|ის არ არის|არა ის|not what i needed|not (?:the )?(?:one|right person)/iu;

/** What the owner's line says about the search just shown; null when it says nothing sure. */
export function searchVerdictOf(line: string): SearchOutcome | null {
  const text = line.trim();
  if (text === '' || text.length > MAX_VERDICT_CHARS || QUESTION_RE.test(text)) return null;
  if (REFUSED_RE.test(text)) return 'refused';
  if (EXACTLY_RE.test(text)) return 'accepted';
  if (YES_RE.test(text) && THANKS_RE.test(text)) return 'accepted';
  return null;
}
