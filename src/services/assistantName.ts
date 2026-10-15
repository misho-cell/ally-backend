/**
 * The frontend's item 3 (0316): the owner names their own assistant, and the
 * model reads the name from the next answer on. The sentence is Misho's, word
 * for word (D44, his „კი" in the code session's chat, 15 Oct ~05:15 UTC); it is
 * added only when a name is set, so an owner without one sees no change.
 */
export function assistantNameSection(assistantName: string | null, ownerName: string): string {
  const name = assistantName?.trim() ?? '';
  if (name === '') return '';
  const owner = ownerName.trim() === '' ? 'the owner' : ownerName.trim();
  return (
    `\n\nThe owner calls you „${name}". Answer to that name in the owner's own conversations; ` +
    `in messages to other people you are still „${owner}'s assistant".`
  );
}
