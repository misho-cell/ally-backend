/**
 * Team task #69 — a loyal old Ally customer (Tornike, 1 October): Netai
 * referred to two men in her contacts as women, both with common Georgian
 * male first names. Georgian has no grammatical gender, so the model guessed
 * from the name — and guessed wrong on names any Georgian reads at once.
 *
 * So a search row now carries `gender` when, and only when, the first name is
 * one of these common Georgian names, in either script. Any other name gets no
 * field, and the result says plainly not to guess.
 */
const MALE_NAMES: ReadonlySet<string> = new Set([
  'გიორგი',
  'გიო',
  'დავით',
  'დათო',
  'ნიკა',
  'ლუკა',
  'ლევან',
  'ირაკლი',
  'ზურაბ',
  'ზურა',
  'გოგა',
  'გელა',
  'ვანო',
  'თემო',
  'ბექა',
  'სანდრო',
  'ალექსანდრე',
  'ნიკოლოზ',
  'ნიკო',
  'დიმიტრი',
  'მიხეილ',
  'მიშო',
  'თორნიკე',
  'ლაშა',
  'ზაზა',
  'გია',
  'მამუკა',
  'დაჩი',
  'ოთარ',
  'შოთა',
  'ვახტანგ',
  'ვახო',
  'კახა',
  'ბესიკ',
  'გურამ',
  'ავთანდილ',
  'რევაზ',
  'რეზო',
  'ილია',
  'თენგიზ',
  'ზვიად',
  'ბადრი',
  'მერაბ',
  'აკაკი',
  'გივი',
  'ნოდარ',
  'პაატა',
  'გაგა',
  'გიგა',
  'საბა',
  'ნუგზარ',
  'ვაჟა',
  'ჯაბა',
  'მალხაზ',
  'უჩა',
  'სოსო',
  'ბიძინა',
  'თამაზ',
  'ომარ',
  'giorgi',
  'gio',
  'davit',
  'dato',
  'nika',
  'luka',
  'levan',
  'irakli',
  'zurab',
  'zura',
  'goga',
  'gela',
  'vano',
  'temo',
  'beka',
  'sandro',
  'aleksandre',
  'nikoloz',
  'niko',
  'dimitri',
  'mikheil',
  'misho',
  'tornike',
  'lasha',
  'zaza',
  'gia',
  'mamuka',
  'dachi',
  'otar',
  'shota',
  'vakhtang',
  'vakho',
  'kakha',
  'besik',
  'guram',
  'avtandil',
  'revaz',
  'rezo',
  'ilia',
  'tengiz',
  'zviad',
  'badri',
  'merab',
  'akaki',
  'givi',
  'nodar',
  'paata',
  'gaga',
  'giga',
  'saba',
  'nugzar',
  'vazha',
  'jaba',
  'malkhaz',
  'ucha',
  'soso',
  'bidzina',
  'tamaz',
  'omar',
]);

const FEMALE_NAMES: ReadonlySet<string> = new Set([
  'ნინო',
  'ნინია',
  'მარიამ',
  'ანა',
  'ანი',
  'თამარ',
  'თამუნა',
  'თაკო',
  'ქეთევან',
  'ქეთი',
  'ნათია',
  'ეკა',
  'ეკატერინე',
  'სალომე',
  'ლიკა',
  'მაკა',
  'თეა',
  'ნანა',
  'ლელა',
  'ნატო',
  'ხატია',
  'სოფო',
  'სოფიო',
  'მაია',
  'ირმა',
  'ლია',
  'მზია',
  'ლალი',
  'თინა',
  'მანანა',
  'ელენე',
  'ბარბარე',
  'მარი',
  'ნუცა',
  'ნინი',
  'ხათუნა',
  'მარინა',
  'ირინე',
  'ელისო',
  'გვანცა',
  'თეონა',
  'nino',
  'ninia',
  'mariam',
  'ana',
  'ani',
  'tamar',
  'tamuna',
  'tako',
  'ketevan',
  'keti',
  'natia',
  'eka',
  'ekaterine',
  'salome',
  'lika',
  'maka',
  'tea',
  'nana',
  'lela',
  'nato',
  'khatia',
  'sopo',
  'sophio',
  'maia',
  'irma',
  'lia',
  'mzia',
  'lali',
  'tina',
  'manana',
  'elene',
  'barbare',
  'mari',
  'nutsa',
  'nini',
  'khatuna',
  'marina',
  'irine',
  'eliso',
  'gvantsa',
  'teona',
]);

export enum NameGender {
  Male = 'male',
  Female = 'female',
}

export const GENDER_RULE =
  '`gender` is given only where the first name is a common Georgian name. Where a row has ' +
  'no `gender`, do not guess one from the name: speak of the person by name, without a ' +
  'gendered word.';

const FIRST_WORD_RE = /[\p{L}]+/u;

/** The gender of a common Georgian first name, or null when it is not certain. */
export function genderOfFirstName(name: string | null | undefined): NameGender | null {
  if (typeof name !== 'string') return null;
  const first = FIRST_WORD_RE.exec(name)?.[0]?.toLowerCase();
  if (first === undefined) return null;
  if (MALE_NAMES.has(first)) return NameGender.Male;
  if (FEMALE_NAMES.has(first)) return NameGender.Female;
  return null;
}

function withGender(row: unknown): unknown {
  if (row === null || typeof row !== 'object') return row;
  const r = row as { name?: unknown; saved_as?: unknown };
  const name =
    typeof r.name === 'string' ? r.name : typeof r.saved_as === 'string' ? r.saved_as : null;
  const gender = genderOfFirstName(name);
  return gender === null ? row : { ...(row as Record<string, unknown>), gender };
}

/** A search result's rows, each with `gender` where the first name makes it certain. */
export function withNameGenders(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object') return raw;
  const r = raw as { results?: unknown };
  if (!Array.isArray(r.results) || r.results.length === 0) return raw;
  return {
    ...(raw as Record<string, unknown>),
    results: r.results.map(withGender),
    gender_rule: GENDER_RULE,
  };
}
