import { matchOccupation } from './labelParser.service';
import { professionFamilyKey } from './professionFamilies';

/**
 * 3566 (MASTER TEST RUN chat #6, PR-010, 6 of 6): two people saved the owner
 * with the tags „იურისტი" and „ადვოკატი", and „how do others have me saved?"
 * was answered with her own name only. The tags were never read, and the two
 * words were never seen as one trade. This is the general picture: the trades
 * people know the owner for, each said only when at least two different people
 * put a word of that trade on her — never who, never how many, never a
 * saver's label beside it (the rule of §99.6 for saved names).
 */
export const MIN_SAVERS_FOR_A_TRADE = 2;

/** One word one saver put on the owner: a tag, or a word of the label they saved. */
export interface SaverWord {
  readonly saverId: number;
  readonly word: string;
}

interface TradeGroup {
  readonly key: string;
  readonly savers: Set<number>;
  readonly wordUses: Map<string, number>;
}

/** The trade a word names, as the word to say and the key its family shares; null if no trade. */
function tradeOf(word: string): { readonly key: string; readonly said: string } | null {
  const trimmed = word.trim();
  const familyKey = professionFamilyKey(trimmed);
  if (familyKey !== null) return { key: familyKey, said: trimmed.toLowerCase() };
  const occupation = matchOccupation(trimmed);
  if (occupation === null) return null;
  return { key: professionFamilyKey(occupation) ?? occupation, said: occupation };
}

/** The word most savers used for the trade; on a tie, the family's own word, then alphabetical. */
function mostUsedWord(group: TradeGroup): string {
  const rank = (word: string): number => (word === group.key ? 0 : 1);
  return [...group.wordUses.entries()].sort(
    ([a, aUses], [b, bUses]) => bUses - aUses || rank(a) - rank(b) || a.localeCompare(b),
  )[0][0];
}

/** The trades at least two savers know the owner for, most savers first. */
export function tradesKnownFor(
  words: readonly SaverWord[],
  minSavers: number = MIN_SAVERS_FOR_A_TRADE,
): string[] {
  const groups = new Map<string, TradeGroup>();
  for (const { saverId, word } of words) {
    const trade = tradeOf(word);
    if (trade === null) continue;
    const group = groups.get(trade.key) ?? {
      key: trade.key,
      savers: new Set<number>(),
      wordUses: new Map(),
    };
    group.savers.add(saverId);
    group.wordUses.set(trade.said, (group.wordUses.get(trade.said) ?? 0) + 1);
    groups.set(trade.key, group);
  }
  return [...groups.values()]
    .filter((group) => group.savers.size >= minSavers)
    .sort((a, b) => b.savers.size - a.savers.size)
    .map(mostUsedWord);
}
