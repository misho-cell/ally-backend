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
  // Ticket 20 row 8, founder's ruling of 16 September. Measured on the live
  // base: of the 400 commonest whole-word tokens, 34 would have been printed as
  // somebody's EMPLOYER, and eight of those are trades. They were missing for
  // the same reason „Elektrikosi" was — the Georgian word is here and the Latin
  // spelling people actually type is not.
  //
  // Carriers, and how many people the substring wrongly catches inside a LARGER
  // word (containsAny is a substring match, so that number is the entry's cost).
  // The overflow is almost all Georgian inflection (mdzgolis, bugalteria),
  // which is a correct catch and not a wrong one.
  //
  //   mdzgoli    7,937 driver       +156 (2%)
  //   bugalteri  6,557 accountant   +542 (8%)
  //   dacva      5,358 security     +921 (15%)
  //   makleri    4,878 broker       +119 (2%)
  //   taqsi      4,151 taxi         +246 (6%)
  //   maliari    4,054 plasterer     +48 (1%)
  //   prarabi    2,852 foreman       +45 (2%)
  //   mkeravi    2,499 tailor        +65 (3%)
  'მძღოლ',
  'mdzgoli',
  'ბუღალტერ',
  'bugalter',
  'დაცვ',
  'dacva',
  'მაკლერ',
  'makleri',
  'ტაქსი',
  'taqsi',
  'taksi',
  'მალიარ',
  'maliari',
  'პრორაბ',
  'prarabi',
  'prorabi',
  'მკერავ',
  'mkeravi',
  'ხელოსან',
  'khelosani',
  'xelosani',
  // Ticket 13 Task 18, read live 10 Sep: „ქეთი პარიკმახერი ჯიქია" reached the
  // founder's list — a hairdresser is a trade.
  'პარიკმახერ',
  'parikmaxer',
  'parikmakher',
  'სანტექნიკ',
  'santeknik',
  'plumber',
  'ელექტრიკ',
  'eleqtrik',
  // Ticket 18 [8], the tester's second detail: „Soso Elektrikosi" came back with
  // „Elektrikosi" as his COMPANY while „დათო ელექტრიკოსი" correctly read it as
  // his trade. One Georgian word, two ordinary Latin spellings — ქ is written
  // both `q` and `k` — and only one of them was here. The list already carries
  // such pairs (khelosani/xelosani, parikmaxer/parikmakher); this one was
  // simply missed, and a trade word absent from the trade list falls through to
  // „everything else that is not a name", which is the company slot.
  'elektrik',
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
  'მასწავლებელ',
  'maswavlebel',
  'mastsavlebel',
  'დამლაგებელ',
  'damlagebel',
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
  // Ticket 20 row 8, same audit. „ნათლია" and „ბიცოლა" were already here in
  // Georgian and were still read as an EMPLOYER when typed in Latin.
  //   natlia   4,642  +313 (6%)
  //   bicola   3,700  +237 (6%)
  //   klaseli  3,254  +381 (10%)  — in neither script before
  'natlia',
  'bicola',
  'კლასელ',
  'klaseli',
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
  // Ticket 20 row 8, same audit: car parts read as a company name.
  //   dashlilebi  3,386  +40 (1%)
  //   nawilebi    2,917  +197 (6%)
  'დაშლილები',
  'dashlilebi',
  'ნაწილები',
  'nawilebi',
  // Ticket 16 Task 87 leftover: business labels in the identity queue
  // („Giorgi Restorani Agaraki", „Posta Niko") — a place of business, not a person.
  'რესტორან',
  'restoran',
  'კაფე',
  'kafe',
  'cafe',
  'ფოსტა',
  'posta',
  'სალონ',
  'salon',
  'აფთიაქ',
  'aptiaq',
  'apteka',
  'კლინიკ',
  'klinik',
  'clinic',
  'სასტუმრო',
  'sastumro',
  'hotel',
  'ბინა',
  'bina',
  // Ticket 13 Task 18: „Giorgi magazia ,,titani"" is a shop, not a person.
  'მაღაზია',
  'magazia',
  'maghazia',
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
  // Ticket 20 row 8, same audit. „ქუთაისი" was here twice over — as Georgian
  // and as `kutaisi` — and still missed `qutaisi`, because ქ is written both
  // ways. Two Tbilisi districts were in neither script.
  //   rustavi  4,767  +696 (13%)
  //   qutaisi  4,144  +466 (10%)
  //   digomi   3,874  +229 (6%)
  //   gldani   3,326  +610 (16%)
  //
  // NOT added, and this is what measuring bought: „gori" sits inside „grigori",
  // a first name — 3,440 of its 7,716 carriers, 45%. The same for dzia (51%),
  // didi (52%), bagi (32%), aveji (24%), lilo (17% on four characters) and gazi
  // (74%: „magazia" is a shop). A substring dictionary cannot hold a short
  // word, however common it is.
  'rustavi',
  'qutaisi',
  'დიღომი',
  'digomi',
  'გლდანი',
  'gldani',
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
