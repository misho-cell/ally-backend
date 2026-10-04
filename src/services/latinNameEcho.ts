/**
 * The tester's 1145 (37876): „თემო ("Temo Eleqtrikosi") ელექტრიკოსად გაქვს
 * შენახული" — the owner's Latin label echoed in brackets after the name the
 * reply had already written in Georgian. In a Georgian reply such an echo goes:
 * a quoted, Latin-only bracket straight after a Georgian word whose first
 * letter it starts with. A company's name in brackets, unquoted or after
 * another word, stays.
 */
const ECHO_RE = /([ა-ჰ]+)\s*\(\s*["“„']([A-Za-z][A-Za-z'’.\- ]*)["”“']\s*\)/gu;

/** The Latin letters a Georgian letter is commonly written with, at the start of a name. */
const LATIN_INITIALS: Readonly<Record<string, string>> = {
  ა: 'a',
  ბ: 'b',
  გ: 'g',
  დ: 'd',
  ე: 'e',
  ვ: 'vw',
  ზ: 'z',
  თ: 't',
  ი: 'iy',
  კ: 'kc',
  ლ: 'l',
  მ: 'm',
  ნ: 'n',
  ო: 'o',
  პ: 'p',
  ჟ: 'jz',
  რ: 'r',
  ს: 's',
  ტ: 't',
  უ: 'u',
  ფ: 'pf',
  ქ: 'kq',
  ღ: 'gq',
  ყ: 'qy',
  შ: 's',
  ჩ: 'c',
  ც: 'ct',
  ძ: 'd',
  წ: 'wt',
  ჭ: 'c',
  ხ: 'kx',
  ჯ: 'j',
  ჰ: 'h',
};

function startsAlike(georgian: string, latin: string): boolean {
  const initials = LATIN_INITIALS[georgian[0]] ?? '';
  return initials.includes(latin[0].toLowerCase());
}

export function withoutLatinEchoOfNames(text: string): string {
  return text.replace(ECHO_RE, (whole: string, name: string, latin: string) =>
    startsAlike(name, latin) ? name : whole,
  );
}
