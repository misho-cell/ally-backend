/**
 * #6364, RULE D846 (Giorgi, 19 Oct 21:01 Tbilisi: „დაიმალოს ეგ შორთქათები"):
 * no card carries a shortcut-answer button. The plan card's „ვადასტურებ" and
 * „შევცვალოთ" were the one exception, until #8054 (founder 27 Oct, box 76726,
 * decision B): NO BUTTONS ANYWHERE. A typed „კი" approves a plan (3/3 the same
 * day). People answer by writing or speaking in the chat field.
 *
 * Applied where buttons leave the server (history, live events and the chat
 * response), so a card written before this rule shows none either.
 */
export function buttonsShown(_choices: unknown): string[] | null {
  return null;
}
