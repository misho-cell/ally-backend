import { fieldTerms, textSpeaksOf } from './prematch.service';

/**
 * 1699 part 3 (A16): the board's example — a goal „hotel in Kobuleti" against
 * an offer „hospitality in Adjara" — is one match, and the literal rule of
 * part 1 could not see it. Two small maps close the gap, and nothing wider:
 *
 *  - a FIELD FAMILY says a hotel is hospitality (a word of the family in the
 *    offer reaches every other word of it in the goal);
 *  - a PLACE MAP says Kobuleti is in Adjara.
 *
 * Field and place are read apart. Part 1 read the offer's whole field line as
 * field words, so a goal and an offer naming the same city matched on the city
 * alone („a lawyer in Batumi" against „hospitality in Batumi"). The place now
 * only narrows: an offer that names a place matches a goal in that place (or a
 * town inside that region); a goal that names no place is not a sure match
 * for an offer that does (D498 — a vague match is dropped, not shown).
 */

/** Words of one trade, the broad name first. Stems are fine: matching is by prefix. */
const FIELD_FAMILIES: readonly (readonly string[])[] = [
  [
    'hospitality',
    'სტუმართმასპინძლობა',
    'hotel',
    'სასტუმრო',
    'guesthouse',
    'hostel',
    'ჰოსტელი',
    'resort',
    'კურორტი',
  ],
  ['tourism', 'ტურიზმი', 'ტურისტული', 'travel', 'მოგზაურობა', 'ტუროპერატორი'],
  ['logistics', 'ლოჯისტიკა', 'transport', 'ტრანსპორტი', 'cargo', 'კარგო', 'გადაზიდვა', 'shipping'],
  ['customs', 'საბაჟო', 'broker', 'ბროკერი'],
  ['real estate', 'უძრავი ქონება', 'realtor', 'რიელტორი', 'property'],
  ['marketing', 'მარკეტინგი', 'advertising', 'რეკლამა', 'branding', 'ბრენდინგი'],
  ['investment', 'ინვესტიცია', 'investor', 'ინვესტორი', 'funding', 'დაფინანსება'],
  ['healthcare', 'ჯანდაცვა', 'clinic', 'კლინიკა', 'medical', 'სამედიცინო'],
];

interface Region {
  readonly key: string;
  /** The region's own names. */
  readonly names: readonly string[];
  /** Towns inside it, each one name group: its Georgian stem first, then Latin spellings. */
  readonly towns: readonly (readonly string[])[];
}

/**
 * Georgia's regions and their main towns. Georgian names are stems, so
 * „ქობულეთში" and „აჭარაში" are found by the same entry.
 */
const REGIONS: readonly Region[] = [
  {
    key: 'adjara',
    names: ['აჭარ', 'adjara', 'achara', 'ajara'],
    towns: [
      ['ბათუმ', 'batumi'],
      ['ქობულეთ', 'kobuleti'],
      ['ხელვაჩაურ', 'khelvachauri'],
      ['ქედა', 'keda'],
      ['ხულო', 'khulo'],
      ['გონიო', 'gonio'],
    ],
  },
  {
    key: 'imereti',
    names: ['იმერეთ', 'imereti'],
    towns: [
      ['ქუთაის', 'kutaisi'],
      ['ზესტაფონ', 'zestaponi'],
      ['ჭიათურ', 'chiatura'],
      ['წყალტუბ', 'tskaltubo'],
      ['სამტრედი', 'samtredia'],
    ],
  },
  {
    key: 'kakheti',
    names: ['კახეთ', 'kakheti'],
    towns: [
      ['თელავ', 'telavi'],
      ['სიღნაღ', 'sighnaghi', 'signagi'],
      ['გურჯაან', 'gurjaani'],
      ['ყვარელ', 'kvareli'],
      ['ლაგოდეხ', 'lagodekhi'],
    ],
  },
  {
    key: 'samegrelo',
    names: ['სამეგრელ', 'samegrelo', 'სვანეთ', 'svaneti'],
    towns: [
      ['ზუგდიდ', 'zugdidi'],
      ['ფოთ', 'poti'],
      ['სენაკ', 'senaki'],
      ['მესტი', 'mestia'],
    ],
  },
  {
    key: 'guria',
    names: ['გურია', 'guria'],
    towns: [
      ['ოზურგეთ', 'ozurgeti'],
      ['ლანჩხუთ', 'lanchkhuti'],
      ['ურეკ', 'ureki'],
    ],
  },
  {
    key: 'samtskhe-javakheti',
    names: ['სამცხე', 'samtskhe', 'ჯავახეთ', 'javakheti'],
    towns: [
      ['ახალციხ', 'akhaltsikhe'],
      ['ბორჯომ', 'borjomi'],
      ['ახალქალაქ', 'akhalkalaki'],
      ['ბაკურიან', 'bakuriani'],
    ],
  },
  {
    key: 'shida-kartli',
    names: ['შიდა ქართლ', 'shida kartli'],
    towns: [
      ['გორ', 'gori'],
      ['ხაშურ', 'khashuri'],
    ],
  },
  {
    key: 'kvemo-kartli',
    names: ['ქვემო ქართლ', 'kvemo kartli'],
    towns: [
      ['რუსთავ', 'rustavi'],
      ['მარნეულ', 'marneuli'],
    ],
  },
  {
    key: 'mtskheta-mtianeti',
    names: ['მთიანეთ', 'mtianeti'],
    towns: [
      ['მცხეთ', 'mtskheta'],
      ['ყაზბეგ', 'kazbegi', 'სტეფანწმინდ', 'stepantsminda'],
      ['გუდაურ', 'gudauri'],
    ],
  },
  {
    key: 'racha',
    names: ['რაჭ', 'racha'],
    towns: [
      ['ამბროლაურ', 'ambrolauri'],
      ['ონ', 'oni'],
    ],
  },
  { key: 'tbilisi', names: ['თბილის', 'tbilisi'], towns: [] },
];

/** A place stem this short would swallow ordinary words; it must be the word, or the word with a case ending. */
const WHOLE_WORD_STEM_CHARS = 3;
/** Georgian endings a short place stem may carry: ფოთი, ფოთში, ფოთის, ფოთიდან. */
const SHORT_STEM_ENDINGS: readonly string[] = ['', 'ი', 'ში', 'ის', 'ზე', 'იდან', 'ისკენ'];
const WORD_RE = /[\p{L}\p{M}]+/gu;

function wordsOf(text: string): string[] {
  return text.toLowerCase().match(WORD_RE) ?? [];
}

function stemMeets(word: string, stem: string): boolean {
  if (stem.length <= WHOLE_WORD_STEM_CHARS) {
    return SHORT_STEM_ENDINGS.some((ending) => word === `${stem}${ending}`);
  }
  return word.startsWith(stem);
}

/** Does the text name this stem? Two-word stems („shida kartli") are read as a phrase. */
function names(text: string, stem: string): boolean {
  if (stem.includes(' ')) return text.toLowerCase().includes(stem);
  return wordsOf(text).some((word) => stemMeets(word, stem));
}

interface Places {
  readonly regions: ReadonlySet<string>;
  readonly towns: ReadonlySet<string>;
}

/** The regions and towns a text names; a town also counts as its region. */
export function placesIn(text: string): Places {
  const regions = new Set<string>();
  const towns = new Set<string>();
  for (const region of REGIONS) {
    if (region.names.some((stem) => names(text, stem))) regions.add(region.key);
    for (const town of region.towns) {
      if (town.some((stem) => names(text, stem))) {
        towns.add(`${region.key}:${town[0]}`);
        regions.add(region.key);
      }
    }
  }
  return { regions, towns };
}

function isAPlaceWord(word: string): boolean {
  return REGIONS.some((region) =>
    [...region.names, ...region.towns.flat()].some(
      (stem) => !stem.includes(' ') && stemMeets(word, stem),
    ),
  );
}

/** The field line without its place words: „hospitality in Adjara" → „hospitality in". */
export function withoutPlaces(field: string): string {
  return wordsOf(field)
    .filter((word) => !isAPlaceWord(word))
    .join(' ');
}

/** Every word of the families the field touches, the field's own words included. */
function familyWords(field: string): string[] {
  const touched = FIELD_FAMILIES.filter((family) =>
    family.some((word) => textSpeaksOf(field, fieldTerms(word))),
  );
  return [field, ...touched.flat()];
}

/** Does the goal speak of the offer's field, directly or through its family? */
export function fieldFits(goalText: string, offerField: string): boolean {
  const field = withoutPlaces(offerField);
  if (field.trim() === '') return false;
  return familyWords(field).some((word) => textSpeaksOf(goalText, fieldTerms(word)));
}

/**
 * Is the goal where the offer is? An offer naming no place fits anywhere. A
 * town in the offer needs that town in the goal; a region in the offer takes
 * the region or any town inside it.
 */
export function placeFits(goalText: string, offerField: string): boolean {
  const offer = placesIn(offerField);
  if (offer.regions.size === 0) return true;
  const goal = placesIn(goalText);
  if (offer.towns.size > 0) return [...offer.towns].some((town) => goal.towns.has(town));
  return [...offer.regions].some((region) => goal.regions.has(region));
}
