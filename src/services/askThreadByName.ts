import { georgianToLatin } from './tools/transliterate';
import { OpenQuestionToMe } from './taskAsks.service';

/**
 * #991 reopened (tester 74020): which open question an answer written in
 * another chat belongs to, read from the asker's name the owner gave.
 *
 * A name matches when every word of it starts the same way as some word of the
 * asker's saved name, in either script („ლაშა" and „Lasha Kurashvili"). One
 * open question and no name is that question. One asker with several open
 * questions is their newest. No match, or a name that fits two askers, is no
 * answer, and the caller says which names are open.
 */
const WORD_SPLIT_RE = /[\s,.;:!?()"„“]+/u;
const STEM_CHARS = 4;

function stems(name: string): string[] {
  return georgianToLatin(name.toLowerCase())
    .split(WORD_SPLIT_RE)
    .filter((w) => w !== '')
    .map((w) => w.slice(0, STEM_CHARS));
}

function sameName(given: string, saved: string): boolean {
  const wanted = stems(given);
  const have = stems(saved);
  return wanted.length > 0 && wanted.every((w) => have.includes(w));
}

export function askThreadForName(
  open: readonly OpenQuestionToMe[],
  askerName: string,
  currentThreadId?: number,
): number | null {
  // Ops 20:10Z (real account, thread 62932, 09:40Z): a wake inside a question's
  // own chat, with three open questions from the same asker, was refused nine
  // times. The chat the run is in answers its own question, unless another asker is named.
  const name = askerName.trim();
  const here = open.find((q) => q.askThreadId === currentThreadId);
  if (here !== undefined && (name === '' || sameName(name, here.askerName))) {
    return here.askThreadId;
  }
  if (name === '') return open.length === 1 ? (open[0]?.askThreadId ?? null) : null;
  // Newest first (openQuestionsToMe's order): one asker's several questions go to the newest.
  const askers = new Set(open.filter((q) => sameName(name, q.askerName)).map((q) => q.askerName));
  if (askers.size !== 1) return null;
  return open.find((q) => askers.has(q.askerName))?.askThreadId ?? null;
}
