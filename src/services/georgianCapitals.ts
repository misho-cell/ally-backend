/**
 * The tester's 1055 (thread 31058): a step began „Ნეტაი Test 170" — the first
 * letter in Mtavruli, the Georgian capital script, the rest in ordinary
 * Mkhedruli. Georgian has no capital letters inside running text; a Mtavruli
 * letter glued to Mkhedruli ones is the model writing English-style
 * capitalisation into Georgian, and it reads as a typo. A word written wholly
 * in Mtavruli (a heading, emphasis) is left alone.
 */
const MTAVRULI_BEFORE_MKHEDRULI_RE = /[Ა-ᲺᲽ-Ჿ](?=[ა-ჺჽ-ჿ])/gu;
const MTAVRULI_TO_MKHEDRULI = 0xbc0;

export function withoutStrayGeorgianCapitals(text: string): string {
  return text.replace(MTAVRULI_BEFORE_MKHEDRULI_RE, (capital) =>
    String.fromCodePoint((capital.codePointAt(0) ?? 0) - MTAVRULI_TO_MKHEDRULI),
  );
}
