import { georgianToLatin } from './tools/transliterate';
import { OpenQuestionToMe } from './taskAsks.service';

/**
 * #991 reopened (tester 74020): which open question an answer written in
 * another chat belongs to, read from the asker's name the owner gave.
 *
 * A name matches when every word of it starts the same way as some word of the
 * asker's saved name, in either script („ლაშა" and „Lasha Kurashvili"). One
 * open question and no name is that question. Anything else — no match, or
 * more than one — is no answer, and the caller says which names are open.
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
): number | null {
  const name = askerName.trim();
  if (name === '') return open.length === 1 ? (open[0]?.askThreadId ?? null) : null;
  const matches = open.filter((q) => sameName(name, q.askerName));
  const threads = [...new Set(matches.map((q) => q.askThreadId))];
  return threads.length === 1 ? (threads[0] ?? null) : null;
}
