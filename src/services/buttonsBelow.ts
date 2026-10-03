/**
 * The tester's 1087 (#509, conversation 32408): a reply with buttons said
 * „აირჩიე ზემოთ" („choose above") while the buttons sit under the message.
 * Buttons are always drawn below the text, so a reply that has them points
 * down. Only the words that point at the buttons change; a reply with no
 * buttons is left as written.
 */
const POINTS_UP: readonly (readonly [RegExp, string])[] = [
  [/აირჩიე\s+ზემოთ/g, 'აირჩიე ქვემოთ'],
  // "above" up to two words before "buttons" / "options": „ზემოთ ხუთივე ვარიანტია" (1088).
  [/ზემოთ((?:\s+[^\s.,!?]+){0,2}?)(\s+)(ღილაკ|ვარიანტ)/g, 'ქვემოთ$1$2$3'],
  [/\b(choose|pick|select|tap)(\s+)(one\s+)?above\b/gi, '$1$2$3below'],
  [/\b(options|buttons|choices)(\s+)above\b/gi, '$1$2below'],
];

export function pointsAtButtonsBelow(reply: string, choices: readonly string[] | null): string {
  if (choices === null || choices.length === 0) return reply;
  return POINTS_UP.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    reply,
  );
}
