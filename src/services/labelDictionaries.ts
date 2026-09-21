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
  /**
   * 20 September. The ticket 20 row 8 audit closed the eight trades it went
   * looking for and left the same hole open everywhere else: a word sitting
   * here in ONE script only. Asked mechanically — every Georgian entry in
   * every dictionary, transliterated (canonical spelling and the drift
   * spellings people actually type), then looked for in its own list — 46 of
   * the 230 entries had no Latin twin at all.
   *
   * The number beside each is the one that matters and it is NOT the carrier
   * count. It is how many aliases carry this word and NO word any of the 230
   * current entries already catches — what the entry actually newly reads.
   * `xelosan` carries 17,577 people and only 660 of them are new, because most
   * of those labels also say „santeqniki" or „eleqtrikosi" and were already
   * read. Thirty-one entries, 21,987 aliases nobody could classify this
   * morning.
   *
   * The second number is the entry's cost: how much of its carrier set it
   * catches INSIDE a longer word, since containsAny is a substring match.
   *
   *   xelosan       660 handyman     1%      khelosan      11             0%
   *   eqim          445 doctor       4%      ekim         180 doctor      3%
   *   mdzgol        201 driver       1%      mdzghol      367 driver      0%
   *   dacv        1,216 security    14%      makler     1,327 broker      1%
   *   maliar        695 plasterer    0%      mkerav        39 tailor      0%
   *   mascavlebel 1,206 teacher      1%      pediatr       64 paediatr.   1%
   *   bughalter     464 accountant   0%      durgal       337 carpenter   0%
   *   potograp      236 photographer 0%      mgebav       115 painter     0%
   *   shemdugeb     103 welder       0%
   *
   * `dacv`'s fourteen per cent was read rather than assumed, and it is not a
   * cost: the words it reaches inside are `jandacva` (healthcare) and
   * `tavdacva` (self-defence). Both are the thing this list is for.
   *
   * FOUR WERE REJECTED, each on what the buried carriers turned out to be:
   *
   *   gori     36%  igori (175) — a man's first name. Also grigori, algoritmi.
   *   lari     50%  beglari, ilarioni, solariumi, kancelaria.
   *   kape     10%  eskape — a business — and chkapelia, A SURNAME. The
   *                 dictionaries are read BEFORE the surname endings, so this
   *                 one would turn a family name into a thing. `kafe` is
   *                 already here and loses nothing.
   *   helosan  98%  every single one is `khelosani`, which is added above.
   */
  'xelosan',
  'khelosan',
  'eqim',
  'ekim',
  'mdzgol',
  'mdzghol',
  'dacv',
  'makler',
  'maliar',
  'mkerav',
  'mascavlebel',
  'pediatr',
  'bughalter',
  'durgal',
  'potograp',
  'mgebav',
  'shemdugeb',
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
  /**
   * 21 September — SHORTENED, not added, and the shortening is the fix.
   *
   * „maswavlebel" read the word spelled right. Whole-base, every token that
   * contains „masw" at all:
   *
   *   maswavlebeli 4,995   masw 2,690   maswi 2,333   maswii 95
   *   maswav 45   maswa 35   maswavkebeli 15   maswaclebeli 15
   *   maswavleveli 14   maswalebeli 13   maswavlebli 12 … and fifty more
   *
   * `masw` is the abbreviation people actually type — „nino masw matematika",
   * „neli rusulis masw" — and it never leads a label (0% of 33 in the sample,
   * against 93% for a first name). The longer entry could not see it, so
   * roughly five thousand teachers per script were read as a company word
   * called „masw".
   *
   * WHAT THE COLLATERAL ACTUALLY IS, after I got it wrong once.
   *
   * I first wrote here „no collateral at all". That came from a listing of the
   * thirty most-carried tokens containing `masw`, and I read a truncated list
   * as a census — the same mistake as `count: 50` meaning fifty exist. The
   * seat's 380 turned up the counterexample inside a live network the same
   * hour: `swormasworo`, which contains „masw" and is not a teacher.
   *
   * Asked properly — every distinct token in the base containing it and NOT
   * starting with it, no limit — there are about 120, and all but a handful
   * are „NameTeacher" written as one word: `ninomasw`, `lalimaswi`,
   * `specmaswavlebeli`, `ინგლისურისმასწავლებელი`. Those are teachers and
   * reading them as a trade is right.
   *
   * The genuine misses are six people:
   *
   *   მამასწარაშვილი  1   A SURNAME, and the one that matters.
   *   mimaswavla      3   „taught me" — a verb.
   *   amaswavlebe     1   the same verb.
   *   swormasworo     1   the seat's find.
   *
   * Six against roughly seven thousand, and none of them becomes a company —
   * they become a trade, which is the mild direction. The entry stays. What
   * does not stay is the sentence claiming there was nothing to measure.
   */
  'მასწ',
  'masw',
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
  /**
   * 21 September. Four trades that the 400 most-carried tokens in the base
   * still hand to `classifyToken`'s give-up branch — read as company words.
   * Every token in the WHOLE base containing each entry was listed before the
   * entry was written, not sampled:
   *
   *   dazgvev / დაზღვევ  2,211 + 1,404   insurance
   *   kurier  / კურიერ   2,023 + 2,012   courier
   *   stilist / სტილისტ  1,516 + 1,141   stylist
   *
   * Their collateral was re-asked the strict way after the `masw` correction
   * below — every distinct token containing the word and NOT starting with it,
   * no limit on the listing. Nothing in any of the six lists is outside the
   * trade: `sakuriero` (a courier service, 118 + 149), `sadazgvevo` (an
   * insurer, 245 + 137), `avtodazgveva`, `motokurieri`, and names glued to the
   * word — `elzastilisti`, `mishakurieri`. **No surnames and no other word.**
   *
   * The only entries they reach that are not the trade itself are insurers
   * written as one word — „tbcdazgveva", „primedazgveva" — thirteen people,
   * who go from an organisation word to a trade. They sell insurance; that is
   * not a loss.
   */
  'dazgvev',
  'დაზღვევ',
  'kurier',
  'კურიერ',
  'stilist',
  'სტილისტ',
  /**
   * The nanny, and the ONLY one of the four that costs something measured.
   *
   * It has to be the whole word „dzidza" and never the stem „dzidz": that
   * stem is three Georgian families — Dzidziguri (465 + 287), Dzidzishvili
   * (90 + 52), Dzidzikashvili (85 + 40) — roughly a thousand people whose
   * surname would become a job.
   *
   * With the full word the cost is two families that end in „-a": Dzidzava
   * (23 + 13) and Dzidzaria (26 + 13), 75 people read as nannies. Against
   * 2,250 who are nannies. Dzidzava is the real regression — `isNameToken`
   * reads it correctly today by its „ava" ending — and 36 people is the price
   * of the other 2,250 not being a company called Dzidza.
   */
  'dzidza',
  'ძიძა',
  /**
   * Translation — row 8's third example, „თარგმნა and Service", and the one
   * the ticket had wrong about what kind of fault it was.
   *
   * It is not a stripper bug. The word is in NO dictionary, in either script,
   * so `classifyToken` gave up on it and called it a company. „თარგმნა
   * ნოტარიუსი", „targmna kartuli-inglisuri", „tamar akhmeteli targmna
   * notariusi", „სოფო ტრადოსი თარგმნა" — every one of them is somebody who
   * translates for a living.
   *
   * THE STEM, not the word, and it is worth the two extra characters: `targmn`
   * also reaches `mtargmneli` and `მთარგმნელი` — the actual noun for a
   * translator, 53 people, which was equally unclassified.
   *
   *   targmn   274 carriers    თარგმნ   130
   *
   * Whole-base collateral, every token containing it without starting with
   * it: 13 in Latin and 7 in Georgian, and all of them are this trade or its
   * verb — `mtargmneli` 31, `მთარგმნელი` 22, `mitargmne`, `gadatargmna`,
   * `სათარგმნი`. No surnames and no other word.
   */
  'targmn',
  'თარგმნ',
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
  // 20 September, the one-script sweep described above TRADE_WORDS. Newly
  // classified aliases, and the substring cost:
  //
  //   klasel    111 classmate  1%   — `klaseli` was here; this reads klaselma,
  //                                   klaselia, klaselze, which it could not.
  //   bitsola    46 aunt       0%   — the canonical spelling of ბიცოლა, beside
  //                                   the `bicola` people type more often.
  'klasel',
  'bitsola',
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
  /**
   * 21 September. „Friend" — 2,965 + 1,568 whole-base, and it was being read
   * as a company word. Every token containing it is the word with a case
   * ending or somebody's friend („anasmegobari", „dedasmegobari"), so the
   * substring tier holds it with nothing to declare.
   */
  'megobar',
  'მეგობარ',
];

// Words for a dwelling, a door or a price. After the relabelling, two rows
// said out loud what they are: „Wina Korpusis Karebis Nomeri" (the number of
// the front building's door) and „Orbi Batumi bina 60 GEL" (a flat at sixty
// lari). Generic words, not a brand list — every one of them is a thing rather
// than a person, in any building in the country.
export const THING_WORDS = [
  // 20 September, the one-script sweep described above TRADE_WORDS. Newly
  // classified aliases, and the substring cost:
  //
  //   binis     1,606 of a flat   6%      nacilebi  1,158 parts      4%
  //   fosta       685 post        5%      aftiaq      628 pharmacy   7%
  //   aptiak      172 pharmacy    5%      aftiak      124 pharmacy   8%
  //   natsilebi   125 parts       6%
  //
  // Three spellings of აფთიაქ are here because all three are typed and no two
  // of them contain each other.
  'binis',
  'nacilebi',
  'natsilebi',
  'fosta',
  'aftiaq',
  'aptiak',
  'aftiak',
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
  // 20 September, the one-script sweep described above TRADE_WORDS. Five towns
  // and a district were here in Georgian only. Newly classified aliases, and
  // the substring cost:
  //
  //   telavi   2,381  0%      zugdidi  2,091  0%      poti  2,076  11%
  //   foti     1,500  1%      gudauri  1,334  1%      dighomi  284  5%
  //
  // `poti`'s eleven per cent is `kapoti` (a car bonnet), `kompoti` and
  // `kalapoti` — twenty carriers, two, two. Things rather than people, so the
  // worst it can do is decline to count a word as a company, which is the mild
  // direction. `gori` was rejected on the same test and is NOT here: its
  // buried carriers are `igori`, a man's first name, 175 of them.
  'telavi',
  'zugdidi',
  'poti',
  'foti',
  'gudauri',
  'dighomi',
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
  /**
   * 21 September. Pekini — the avenue in Tbilisi and the market on it, 626 +
   * 242 whole-base and read as a company until now. Every token containing it
   * is the street, its case endings, or an address built on it
   * („pekiniplaza", „pekinis30"). The one word that is not is „pekinuri",
   * four people, the dog.
   */
  'pekin',
  'პეკინ',
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

/**
 * THE SHORT WORDS — matched as a WHOLE TOKEN, never as a substring.
 *
 * Everything above is read with `containsAny`, a substring match, and that is
 * right for a long word: Georgian inflects by suffix, so „mdzgolis" and
 * „bugalteria" have to be caught by the stem sitting inside them. It is fatal
 * for a short one. Measured on the live base, that is the whole reason these
 * words — the commonest in the entire phonebook — were still missing:
 *
 *   deda   26,533 carriers   „mother"       inside them: nothing
 *   mama   22,279            „father"       MAMARDASHVILI
 *   saxli   9,558            „house"
 *   dzia    8,810            „uncle"
 *   gori    7,716            the town       IGORI, 175 men
 *   bebo   10,162            „granny"
 *
 * So they are read by `matchesAnchored` instead: the token IS the word, or the
 * word plus at most three letters of case ending. „gori", „goris", „goridan"
 * are the town; „igori" and „grigori" are not the town at all, and „gorishvili"
 * is somebody's family.
 *
 * AND THE ENDING MUST NOT BE A SURNAME'S. Three letters is exactly „dze", so
 * without that second guard „dididze" — 117 people — would stop being a name.
 *
 * WHAT IS STILL REFUSED, and this is the honest edge of the mechanism:
 *
 *   lari   „larisa" (821) and „larissa" (24) are a woman. The ending „sa" is
 *          not a surname's, so no guard here can tell her from the money.
 *   didi   the adjective „big". It belongs to no class this file has.
 *
 * `larisa` is read as a company word today, which is wrong but PROVISIONAL —
 * the three-saver rule drops it. A dictionary hit is final. Turning a quiet
 * wrong answer into a confident one is the worse trade.
 */
export const ANCHORED_SUFFIX_MAX = 3;

/** Carriers matched by the anchored rule, Latin then Georgian. */
export const SHORT_RELATION_WORDS = [
  'deda', // 25,134
  'დედა', // 18,640
  'mama', // 19,047
  'მამა', // 12,568
  'bebo', // 9,871
  'ბებო', // 8,303
  'dzia', // 4,527
  'ძია', // 4,239
  // „ბებია" is the one this tier was most needed for: it ends in „ია", so the
  // surname rule claimed it and a grandmother was read as a family name.
  'bebia', // 2,679
  'ბებია', // 2,839
  /**
   * 21 September — the grandfather, in the two words Georgian actually uses,
   * and both of them needed the new second guard in `matchesAnchored`.
   *
   * Whole-base, and the split is read rather than assumed:
   *
   *   babu  2,920 + babua 1,644 + babus/babuu/babuas/… ≈ 4,900
   *   ბაბუ  1,809 + ბაბუა 1,875 + ბაბუშკა 35 + …       ≈ 3,900
   *
   * „sabas babu dedis mxridan" — Saba's grandfather on his mother's side. Not
   * a company, and 8,700 people were carrying it as one, over `BIG_ORG_SIZE`
   * by a factor of sixty. That is the „Undefined" failure at a fifth of the
   * scale.
   *
   * WHAT IT CATCHES THAT IS NOT A GRANDFATHER, counted: babuka 77, babulia
   * 75, babuna 74, babula 51, babuca 48, babuki 20 and a few smaller —
   * roughly 680 across both scripts, first names and family names. **Every
   * one of them is read as an ORGANISATION today**, so they lose nothing they
   * have; they move from one wrong answer to a harmless one. The single real
   * regression was „ბაბულია" (57), a surname `isNameToken` gets right — and
   * the second guard now refuses it, because the token is longer than „ბაბუ"
   * and ends in „ია".
   *
   * „papa" is here for the same reason and is the word that forced the guard:
   * 2,884 + 2,188 grandfathers against Papava, 671 + 364, whose name the
   * anchored rule would have eaten. With the guard Papava, Papashvili,
   * Papaskiri and Papadze all stay names, and what is left is Papasha 53 and
   * Papala 28 — organisations today, relations after.
   *
   * „babushka" (94) is NOT reached: „shka" is four letters and the anchor
   * allows three. Left as it is rather than widened — the limit is doing work
   * everywhere else.
   */
  'babu', // 2,920
  'ბაბუ', // 1,809
  'papa', // 2,884
  'პაპა', // 2,188
];

export const SHORT_PLACE_WORDS = [
  'gori', // 4,847 — the town. Refused by the substring tier because of Igori.
];

export const SHORT_THING_WORDS = [
  'saxli', // 8,593
  'სახლ', // 5,035
  'sakhli', // 393
  'manqana', // 5,440
  'მანქან', // 5,658
  'aveji', // 3,969
  'ავეჯ', // 2,483
];

/**
 * Tokens that are not words anybody typed — junk that reached the label store
 * and must not be read as anything.
 *
 * `undefined` is on **59,111 alias rows, held by 42,694 people**, and every
 * one of them was written in **August 2026 by 809 different savers**. The
 * whole alias is the single word „Undefined": not a name with junk in it, the
 * word by itself. It is a client writing the JavaScript value where a contact
 * had no display name.
 *
 * WHAT IT WAS DOING. `classifyToken` gives up on a token no dictionary claims
 * and calls it an ORGANISATION. So 42,694 people were carrying a company word
 * called „Undefined" — over `BIG_ORG_SIZE` by three orders of magnitude, so
 * every one of them scored `in_big_organisation`, and `triggerFor` answers
 * `big_company_word` to that. When the research runner is switched on, that
 * points the register at a company named Undefined for 42,694 people.
 *
 * It costs nothing TODAY, and that is why this could be fixed without asking:
 * `RESEARCH_RUNNER` is off and `planned` is zero, so nothing is sent and no
 * live behaviour changes. It stops being free the moment the runner is turned
 * on, which is a decision waiting on Tornike — so this belongs in front of it,
 * not behind it.
 *
 * WHY A SET OF ITS OWN, rather than one more line in NEVER_A_COMPANY. That
 * list already carried `undefined`, privately, in `labelEmployer` — so the
 * employer FIELD was protected and the target ENGINE was not, which is the
 * exact split the 16 September ruling was meant to end. One list, read by
 * `classifyToken`, reaches both.
 *
 * AND IT IS NOT A CLEANUP. The 59,111 rows are still there; removing them
 * touches real people's saved data and is Misho's word, not mine. This only
 * stops them being believed.
 *
 * Nothing goes in here that has not been counted. „null", „nan" and „none"
 * are the obvious neighbours and none of them was in the 300 most-carried
 * tokens, so none of them is here: a list guessed in advance eventually eats
 * a word somebody really wrote.
 */
export const NOT_A_WORD: ReadonlySet<string> = new Set(['undefined']);

/**
 * Words that identify nobody — the label's grammar and its filler.
 *
 * MOVED HERE FROM `labelEmployer` ON 20 SEPTEMBER, and the move is the fix.
 * The list lived privately in that file, so the employer FIELD was protected
 * and the target ENGINE was not: `classifyToken` went on calling four of them
 * organisations, for 35,889 people between them.
 *
 *   axali      9,784   „new"
 *   klienti    9,470   „client"
 *   chemi      8,724   „my"
 *   ჩემი       7,911   the same word, the other script
 *
 * That is the exact split the founder's 16 September ruling was meant to end.
 * Its own words, quoted in the file this came from: „the words are in
 * labelDictionaries now, read by classifyToken for both consumers, and the
 * private copies are gone rather than left here to drift against them." These
 * were left. `undefined` was left too, and was found the same afternoon.
 *
 * So the list stops being copied and becomes one list, in the place both sides
 * already read. Nothing was added to it in the move — the words below are the
 * ones that were already there, measured when they were written.
 */
export const IDENTIFIES_NOBODY: ReadonlySet<string> = new Set([
  // Conjunctions and negations: the label's grammar, not its content.
  'and',
  'or',
  'the',
  'not',
  'no',
  'none',
  'other',
  'და',
  'ან',
  'არა',
  'სხვა',
  /**
   * 21 September — THE LATIN TWINS, and three of the four were refused.
   *
   * Row 8's leftovers sent me back here. Asked mechanically: every Georgian
   * entry in this set and in NOT_A_WORD, transliterated, looked for in the
   * same set. Thirty-six entries, four with no Latin twin — `და`→`da`,
   * `ან`→`an`, `არა`→`ara`, `სხვა`→`skhva`. This base is written in both
   * scripts, so half of each of those words was unprotected.
   *
   * WHICH WENT IN WAS MEASURED, because a wrong entry here is final: this list
   * means „never print as an employer", so a real company word on it loses a
   * real signal for good.
   *
   * The lead share separates a name from a company and says nothing useful
   * about a conjunction, so the discriminator is the LABEL'S LENGTH. Grammar
   * lives inside a sentence; a name is the whole label. Controls at both ends,
   * „nino" and „tbc":
   *
   *     token   labels   mean tokens   1-2 token labels
   *     nino    48,359       2.4            72%     ← a name
   *     tbc      7,151       3.0            31%     ← a company
   *     da       3,787       4.3            13%     IN
   *     ara        121       4.1            31%     IN
   *     sxva       141       3.8            17%     IN
   *     an         311       3.7            39%     refused
   *     ki          92       3.3            53%     refused
   *     ho          40       2.5            58%     refused
   *
   * `da` carries 7,352 people whole-token and sits at three per cent lead — it
   * is „and" inside a note, every sample of it. Note that `და` is both „and"
   * and „sister" and has been on this list since the beginning; the Latin twin
   * inherits that trade-off rather than making a new one.
   *
   * REFUSED, each on what the labels turned out to be:
   *
   *   an   the twin of „ან", and still refused: it is how people shorten Ana.
   *        „an mikadze", „an dgebuadze", „an chonakhidze", „anna an", „megi
   *        an" — 37 standing alone. A conjunction does not carry a surname.
   *   ki   53% of its labels are one or two words. „კი" is not on this list in
   *        Georgian either, so there was no twin to mirror.
   *   ho   NOT the Georgian „yes". Read the labels: „natia bughashvili
   *        projeckt manager ho", „lia kuprashvili ho bughalteri", „andrea ho
   *        sealing machine". It is somebody's job code, used consistently, and
   *        putting it here would delete a real signal from forty people.
   *   diax two carriers. Not worth a final answer.
   */
  'da',
  'ara',
  'sxva',
  'skhva',
  /**
   * `near` — row 8's second example, and it is a preposition doing exactly
   * what the Georgian conjunctions above do.
   *
   * The labels are addresses: „bussines near pizza hut", „real estate near
   * radisson", „notary near restaurant diana", „hostel near the square",
   * „iura lachinovi glass repair near roniko". It tells you where somebody is
   * and never who they are, and it was being printed as their employer.
   *
   * 29 carriers as a whole token, and the most sentence-bound word measured
   * on this list — further from a name than „da" is:
   *
   *     near   20 labels   lead .05   mean 4.8 tokens   5% are 1-2 words
   *     da  3,787          lead .03   mean 4.3         13%
   *     nino   52,154      lead .90   mean 2.4         72%
   */
  'near',
  // Ticket 19 [8], found after the first fix and worse than what was
  // reported. Of the 400 commonest tokens in the whole base, 71 classify as
  // „organisation" — and ten of those cleared the two gates above. They are
  // not companies and never were:
  //
  //   დედა / deda    23,734 carriers, lead share .47 — MOTHER
  //   მამა / mama    16,536                    .72 — father
  //   კლიენტი         9,471                    .19 — client
  //   სახლი           7,295                    .16 — house
  //   მანქანა         5,146                    .25 — car
  //   უნდა            5,920                    .05 — „wants"
  //
  // „დედა" would have been printed as somebody's EMPLOYER. It is the
  // commonest word a person writes in a phonebook and it is in none of the
  // dictionaries — see the note in TASKS.md, which is where the rest of this
  // belongs: the dictionaries also miss the trades (მძღოლი, ბუღალტერი,
  // მაკლერი) and the towns (რუსთავი, გორი, ქუთაისი), and those are shared
  // with the target engine, so they are measured before they are moved.
  //
  // Exact match, both scripts, the spellings people actually type. A prefix
  // rule would read „ახალგაზრდული ასოციაცია" as „new" and drop half a real
  // company's name.
  'დედა',
  'deda',
  'მამა',
  'mama',
  'ბებო',
  'bebo',
  'ბებია',
  'bebia',
  'ჩემი',
  'chemi',
  'კლიენტი',
  'klienti',
  'სახლი',
  'saxli',
  'sakhli',
  'მანქანა',
  'manqana',
  'mankana',
  'ახალი',
  'axali',
  'akhali',
  'უნდა',
  'unda',
  'new',
]);
