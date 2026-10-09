/**
 * 1688 part 2 (with 1695, A12): a likely_yes reader sees the prepared line
 * under „yes". When it is almost right — a date off, a word to add — he taps
 * „other" and the box opens EMPTY, so he retypes the whole answer. The newest
 * message carrying the „other" button now says what that box should start
 * with: the same prepared line, for him to edit. Only the reader's own
 * conversation has it; it is his own profile's wording, shown only to him.
 */
export interface PrefillableMessage {
  readonly role?: string;
  readonly other_choice_index?: number;
}

/** The messages, with `other_prefill` on the newest one that has an „other" button. */
export function withOtherPrefill<T extends PrefillableMessage>(
  messages: readonly T[],
  prefill: string | null,
): Array<T & { other_prefill?: string }> {
  const line = prefill?.trim() ?? '';
  const out: Array<T & { other_prefill?: string }> = [...messages];
  if (line === '') return out;
  for (let i = out.length - 1; i >= 0; i -= 1) {
    const message = out[i];
    if (message.role === 'assistant' && message.other_choice_index !== undefined) {
      out[i] = { ...message, other_prefill: line };
      return out;
    }
  }
  return out;
}
