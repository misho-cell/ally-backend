/**
 * The word lists the targeting engine reads labels with.
 *
 * They lived inside targetScoring.service, unexported, and THE TARGETS asks
 * for a second reader over the same dictionaries (Part 2.2, L2). Two copies of
 * a word list are two word lists: they drift, and the one nobody is looking at
 * is the one that goes stale. One file, one source, both readers.
 */

// Owning or running something (Rule 5 / R2 / R9). A managing partner is an
// owner; a "senior manager at a real company" is the founder's own IN.
export const OWNERSHIP_WORDS = [
  'დამფუძნებელი',
  'თანადამფუძნებელი',
  'მფლობელი',
  'პარტნიორი',
  'თავმჯდომარე',
  'დირექტორი',
  'founder',
  'co-founder',
  'cofounder',
  'owner',
  'ceo',
  'cto',
  'cfo',
  'coo',
  'partner',
  'chairman',
  'chairwoman',
  'president',
  'investor',
  'angel',
];

// A commercial or client-facing job — the founder's 8 July ruling that BD and
// sales count, "their job IS who do I call".
export const ROLE_WORDS = [
  'მენეჯერი',
  'ხელმძღვანელი',
  'დეპარტამენტი',
  'კონსულტანტი',
  // Georgian typed in Latin letters — how a large share of this base is
  // actually written („Kaxa Chipashvili Log Programa", „temur kevlishvili
  // inovaciuri web sivrce"). THE TARGETS asks for both scripts at every step;
  // the English words were here and their transliterations were not, so a
  // label reading „Giorgi Direktori" carried no role word at all.
  'direktor',
  'menejer',
  'xelmdzgvanel',
  'khelmdzghvanel',
  'departament',
  'konsultant',
  'director',
  'manager',
  'head',
  'lead',
  'consultant',
  'business development',
  'sales',
  'commercial',
  'hr',
  'recruiter',
  'board',
];

// ─── Rule 2's exclusion pass, and Rule 14 (c) ──────────────────────────────
// The founder, 31 August: "I think this is a good ranker, but after some
// filtering, when you exclude taxi, mechanics, us, hotlines, people who are
// already paid users, you can see rest as good target."
//
// Five of the exclusions are readable from this database and are applied here.
// Three are NOT, and are named rather than faked: "not living in Georgia",
// "too powerful with no gap to fill", and the Argentine cohort — no column in
// this schema carries any of them, and a gate that guesses is worse than a
// gate that is missing, because it removes people silently.
// G1, in the founder's own words: "Only a trade or a service. Plumber,
// electrician, mechanic, vet, sculptor, calligrapher, photographer, violin
// teacher, taxi driver." Deliberately NOT the label parser's occupation
// dictionary, which also holds lawyer, architect, accountant and programmer —
// those are professions, and gating them out would remove real targets. This
// list is the founder's examples and the criteria file's own
// (khelosani, karobka, avtomatika, airbagi), nothing more.
export const TRADE_WORDS = [
  'ხელოსან',
  'khelosani',
  'xelosani',
  'სანტექნიკ',
  'santeknik',
  'plumber',
  'ელექტრიკ',
  'eleqtrik',
  'electrician',
  'მექანიკ',
  'mechanic',
  'karobka',
  'კარობკა',
  'avtomatika',
  'ავტომატიკა',
  'airbagi',
  'ეარბეგ',
  'shpana',
  'შპანა',
  'პედიატრ',
  'pediatri',
  'ექიმ',
  'eqimi',
  'ekimi',
  'ვეტერინარ',
  'veterinar',
  'მოქანდაკე',
  'moqandake',
  'sculptor',
  'კალიგრაფ',
  'calligraph',
  'ფოტოგრაფ',
  'fotograf',
  'photographer',
  'ვიოლინ',
  'violino',
  'violin',
  'ტაქსი',
  'taxi',
  'taksi',
  'მძღოლ',
  'დურგალ',
  'მღებავ',
  'შემდუღებ',
];

/**
 * Our own company, as the crowd writes it. A phone whose aliases carry it from
 * this many different savers belongs to one of ours (ticket 9 task 10 item 3).
 * Three, not one: a stray „ally" in somebody's label is a typo, three people
 * agreeing is a job.
 */
export const OWN_COMPANY_MARKERS = ['ally', 'ელაი', 'netai', 'ნეტაი'];

// Rule 14 (c): "a label is never a target — 'Maxin.ai Ceo' names a company;
// the person is found first, then judged." A label carrying a company marker
// is only a target once a real person has been confirmed behind the number.
export const COMPANY_MARKERS = [
  '.ai',
  '.ge',
  '.com',
  '.io',
  'llc',
  'ltd',
  'inc',
  'შპს',
  'ooo',
  'ооо',
  'group',
  'studio',
  'agency',
  'company',
];

// Words that make a label an ORGANISATION rather than a person (ticket 9 task
// 23: „ახალგაზრდული ასოციაცია" passed `person_confirmed: true`).
export const ORGANISATION_WORDS = [
  'ასოციაცია',
  'asociacia',
  'association',
  'კავშირი',
  'ფონდი',
  'fondi',
  'foundation',
  'კლუბი',
  'klubi',
  'club',
  'სკოლა',
  'skola',
  'school',
  'ცენტრი',
  'centri',
  'center',
  'centre',
  'ორგანიზაცია',
  'organization',
  'organisation',
  'სააგენტო',
  'agency',
  'სამსახური',
  'ministry',
  'სამინისტრო',
];

// How people label a relative or a neighbour. „Tornike Mezobeli" is Tornike
// the neighbour — the second word is a relationship, not a surname, and the
// list must not treat it as one (ticket 9 task 23).
export const RELATIONSHIP_WORDS = [
  'მეზობელ',
  'mezobel',
  'ძმა',
  'dzma',
  // 'და' is deliberately absent. It means "sister" AND "and", and it opens
  // დათო, დავით and დარეჯან — it removed „დათო ხაზარაძე" from the list during
  // testing, which is a real person losing his first name to a conjunction.
  'ბიძა',
  'bidza',
  'დეიდა',
  'deida',
  'მამიდა',
  'mamida',
  'ბიცოლა',
  'ნათლია',
  'კუმბარი',
  'kumbari',
  'brother',
  'sister',
  'uncle',
  'aunt',
  'neighbour',
  'neighbor',
  'cousin',
];

// Words for a dwelling, a door or a price. After the relabelling, two rows
// said out loud what they are: „Wina Korpusis Karebis Nomeri" (the number of
// the front building's door) and „Orbi Batumi bina 60 GEL" (a flat at sixty
// lari). Generic words, not a brand list — every one of them is a thing rather
// than a person, in any building in the country.
export const THING_WORDS = [
  'ბინა',
  'bina',
  'კორპუს',
  'korpus',
  'კარები',
  'karebi',
  'ნომერი',
  'nomeri',
  'სადარბაზო',
  'sadarbazo',
  'ბინის',
  'ოთახი',
  'otaxi',
  'flat',
  'apartment',
  'ლარი',
  'gel',
  'usd',
];

// A city is where somebody is, never who they are — and „ბათუმი ორბი 2" is a
// building, not a person.
export const PLACE_WORDS = [
  'თბილისი',
  'tbilisi',
  'ბათუმი',
  'batumi',
  'ქუთაისი',
  'kutaisi',
  'რუსთავი',
  'გორი',
  'ზუგდიდი',
  'ფოთი',
  'თელავი',
  'ბაკურიანი',
  'bakuriani',
  'გუდაური',
];

export const BRAND_STOPLIST: ReadonlySet<string> = new Set([
  'wissol',
  'rompetrol',
  'socar',
  'sokari',
  'maksima',
  'gulf',
  'magti',
  'magticom',
  'silknet',
  'geocell',
  'beeline',
  'bank',
  'banki',
  'tbc',
  'bog',
  'liberty',
  'servisi',
  'service',
  'servis',
  'delivery',
  'express',
  'hotline',
  'taxi',
  'taksi',
]);

/**
 * A profession with its own clients (THE TARGETS 2.2, L2 — target 4).
 *
 * The distinction that matters: a TRADE word closes the door (a plumber is
 * not a target), a profession-with-clients OPENS one. Both are "what he does"
 * words and neither is a name, so they must be told apart explicitly — a
 * consultant and an electrician are the same shape to a tokeniser.
 */
export const PROFESSION_WITH_CLIENTS = [
  'ადვოკატ',
  'advokat',
  'იურისტ',
  'iurist',
  'lawyer',
  'აუდიტორ',
  'auditor',
  'ბუღალტერ',
  'buhalter',
  'buღalter',
  'accountant',
  'ნოტარიუს',
  'notarius',
  'notary',
  'ბროკერ',
  'broker',
  'რიელტორ',
  'rieltor',
  'realtor',
  'კონსულტანტ',
  'konsultant',
  'consultant',
  'აგენტ',
  'agent',
  'დისტრიბუტორ',
  'distributor',
  'იმპორტიორ',
  'importior',
  'რეკრუტერ',
  'recruiter',
];

/**
 * A startup, or a programme that only startups are in (target 6). The one
 * door THE TARGETS opens with no company behind it: "no registered company
 * needed" (D111), so an empty register must never park these people.
 */
export const STARTUP_WORDS = [
  'სტარტაპ',
  'startap',
  'startup',
  'mvp',
  'pitch',
  'preseed',
  'pre-seed',
  'seed',
  'accelerator',
  'აქსელერატორ',
  'incubator',
  'ინკუბატორ',
  'gita',
  'გითა',
  'spark',
  'impacthub',
  'startupbureau',
  'techstars',
];
