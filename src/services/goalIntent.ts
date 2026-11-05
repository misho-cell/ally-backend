import { looksUnfinished } from './unfinishedLine';
// Ticket 16 Task 90 (D168, D171) opened a goal before the run whenever the
// owner's line matched need words („მჭირდება …", „I need …"), and kept a
// question one by question words. #8779 group 4 (the founder, 4 Nov): no fixed
// word lists — a goal opens before the run only on the app's own new-goal
// button (`as_goal`), and otherwise the model opens one with create_task when
// it reads a need. What remains here names a goal and reads an instruction.

const MAX_TITLE_CHARS = 90;

/** Said in create_task's description: a typed need becomes a goal only this way now. */
export const A_NEED_OPENS_A_GOAL =
  ' When the owner states a need — someone to find, meet or reach, something to get done ' +
  'through people — open the goal with this FIRST, in the same turn, before searching or ' +
  'answering: nothing else turns their words into a goal.';

// Instructions to the assistant that are not part of the goal itself.
const TITLE_NOISE_RE =
  /(\.?\s*(ეს\s+)?მიზნად\s+შეინახე\.?|\.?\s*ეს\s+მიზანია\.?|\.?\s*(მნიშვნელოვანი:|important:)[^.]*\.?|\.?\s*არავის\s+არ\s+მისწერო[^.]*\.?|\.?\s*set (this|it) as a goal\.?)/gi;

/**
 * A greeting is not part of the goal.
 *
 * The seat, 17 September: „a goal opened from the goal box still gets the raw
 * sentence as its title (goal 4885, 83 characters with the greeting), because
 * the SERVER writes that title before the model runs. Our prompt cannot reach
 * it." That title is what the stop line quotes back, and what the sidebar
 * shows.
 *
 * Only at the START, and only when something follows it: „გამარჯობა" alone is
 * not a goal and would leave an empty title, and a „hi" in the middle of a
 * sentence is a word.
 *
 * The trailing boundary is a Unicode lookahead, not `\b`, and I wrote `\b`
 * first — ten lines below the comment in this same file that explains why it
 * cannot work. `\b` is ASCII: between „გამარჯობა" and the comma after it there
 * is no word boundary at all, so the Georgian and Russian greetings matched
 * nothing while the English ones matched fine. Georgian inflects at the END of
 * a word, which is exactly where this is asked to look.
 */
const LEADING_GREETING_RE =
  /^\s*(გამარჯობა|სალამი|hello|hi|hey|здравствуй(те)?|привет|hola|buenas)(?![\p{L}\p{N}])[\s,!.—-]*(?=\S)/iu;

/**
 * ⚠️ A WALL OF ONE REPEATED WORD IS NOT A TITLE — the founder's own account.
 *
 * Android's Chrome does not UPDATE one dictation entry as a sentence grows; it
 * ADDS one per update, each holding a longer prefix of the same words. Read
 * faithfully and joined, that builds
 *
 *   „პოლიტიკური პოლიტიკური პოლიტიკური პოლიტიკური …" (goal 10133)
 *   „ინტერნეტის ინტერნეტის ინტერნეტის ინტერნეტის …" (goal 10132)
 *
 * The app team has fixed the microphone, and that closes the SOURCE. It does
 * not close this: the server took a forty-word repetition, wrote it into the
 * column the sidebar shows and the stop line quotes back, and asked nothing.
 * Any other client, or a paste, does it again.
 *
 * Three such titles exist on the live base, all on one account, 16 to
 * 25 September — small, and the point is that nothing was watching rather
 * than how many got through.
 *
 * Collapsed to the word itself, which is what the person said once. Requires
 * a LONG title made of at most two distinct words, so a real „ძალიან ძალიან
 * მჭირდება" is untouched.
 */
const WALL_MIN_CHARS = 60;
const WALL_MAX_DISTINCT_WORDS = 2;

export function collapseARepeatedWall(text: string): string {
  if (text.length < WALL_MIN_CHARS) return text;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 4) return text;
  const distinct = [...new Set(words.map((w) => w.toLowerCase()))];
  if (distinct.length > WALL_MAX_DISTINCT_WORDS) return text;
  // The longest distinct word: „X X X X" collapses to X, and „need need need
  // a a a" keeps the word that carries the meaning rather than the article.
  const kept = words.reduce((a, b) => (b.length > a.length ? b : a));
  return kept;
}

/** The goal's title from the message: the first sentence, without the instructions, capped. */
export function goalTitleFrom(message: string): string {
  const cleaned = collapseARepeatedWall(
    message.replace(TITLE_NOISE_RE, ' ').replace(/\s+/g, ' ').trim(),
  ).replace(LEADING_GREETING_RE, '');
  const firstSentence = cleaned.split(/(?<=[.!?…])\s+/)[0] ?? cleaned;
  const base = (firstSentence.trim() || cleaned || message.trim()).replace(/[.!…]+$/, '');
  if (base.length <= MAX_TITLE_CHARS) return base;
  const cut = base.slice(0, MAX_TITLE_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > MAX_TITLE_CHARS / 2 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

/**
 * Ticket 20 row 103/104 — an instruction naming one person is not a goal, and
 * the app flag must not turn it into one.
 *
 * LIKA, 18 September, thread 17623. She typed the whole thing at 12:57:
 *
 *   12:57:52  „ask Tornike Abuladze if he knows a good philosopher"
 *   13:00:27  „ask him"
 *   13:01:09  „I approve"
 *
 * She said it once and then had to say it twice more. The mechanism: the
 * message became a GOAL, a new goal has its plan proposed for approval, and
 * the plan's whole content was her own sentence. She was asked to approve
 * what she had just written.
 *
 * The founder's ruling: when the owner types a short instruction naming one
 * person and one action, those words ARE the yes. It goes, with no draft
 * first and one line afterwards saying who it went to. A goal with a plan in
 * front of it is the opposite of that.
 *
 * WHY THIS GUARD AND NOT A WIDER RULE. `looksLikeGoalRequest` already says
 * false for all six of these, so on the server's own need-rule they never
 * became goals. Only the app flag did — and the flag is the plus button,
 * measured 19 September by typing one identical sentence down both paths:
 * into the box it made no goal, after pressing plus it made goal 6043. So
 * this is the same shape as the question guard directly above: the flag may
 * turn a statement into a goal, it may not turn a question into one, and now
 * it may not turn an instruction-to-a-named-person into one either.
 *
 * THREE SIGNALS, EACH USELESS ALONE, MEASURED AGAINST 56 REAL GOALS:
 *
 *   names someone in the owner's own phonebook   6 of 6 caught, 34 wrong (15%)
 *   + a contact verb is present                  6 of 6 caught,  1 wrong (86%)
 *   + that verb is not negated                   6 of 6 caught,  0 wrong
 *
 * The 34 are almost all one saved contact: owner 501 has an alias
 * „xatuna sologashvili tbilisi", so every „I need a X in Tbilisi" names
 * somebody in his own phonebook. The single survivor was the seat's own
 * safety phrasing — „Search only, write to nobody" — matching on „write to"
 * inside a negation, which is row 215's shape exactly.
 *
 * THE LIMITS, next to the numbers rather than under them. Six instructions is
 * a small positive class and all six come from two owners and two verbs. The
 * negation list was written after seeing the one case it has to catch, which
 * is the weakest kind of rule there is. This is evidence that the SHAPE is
 * right, not that the wording is finished.
 *
 * SO IT FAILS TOWARDS MAKING THE GOAL. Every uncertain path returns false: no
 * verb, a negated verb, a long message, an unreadable phonebook. A goal that
 * quietly does not appear is the mirror image of the bug being fixed, and it
 * is the harder one to notice.
 */

/**
 * „ask", „tell", „write to" — and the Georgian, which inflects at the end.
 *
 * TWO ADDED 23 SEPTEMBER, both found by checking the tester's own test cases
 * against the build BEFORE they ran them rather than after.
 *
 * `უთხ` — „tell". The list already held the Georgian for ASK (ჰკითხე) and for
 * WRITE (მისწერ) and the English for all three, so „Netai Test 2-ს უთხარი რომ
 * ხუთშაბათს შემიძლია" was not an instruction while its English twin was. That
 * is an asymmetry rather than a decision: nothing anywhere argues that a
 * Georgian „tell" should count for less.
 *
 * Spanish and Russian (#1156, the tester's 1163, 39140): „Preguntale a X si…"
 * asked the owner to confirm a send they had already asked for, where „Ask X
 * if…" and „ჰკითხე X-ს" go in the same turn.
 *
 * `send … to/through` — and it carries its direction ON PURPOSE. A bare „send"
 * would swallow „send me the list" and „send it again", which are instructions
 * to the ASSISTANT about its own output and not about reaching a person. What
 * row 104 is actually about is „send the introduction request THROUGH Test 3",
 * where the preposition is the whole difference. This matters more than it
 * would have yesterday, because since today this predicate also stands at the
 * consent wall, where the phonebook half is deliberately not paid for — so the
 * verb has to carry the weight on its own.
 */
/**
 * 2311 (the tester's 56799, CE 0 of 5): „სთხოვე გიორგი ხიდაძეს…" matched only
 * „თხოვ", so the verb's own „ე" was read as the first word of the name („ე
 * გიორგი ხიდაძე") and the go-between was never found. Each verb now takes its
 * ending with it: „სთხოვე", „მისწერე", „უთხარი".
 */
/*
 * The tester's 62615 (thread 55482): „ჩამომიწერე სამი სახელი სიად: ნინო, გიორგი,
 * ანა" (write me down a list) read as an order to write to someone, because
 * „ჩამომიწერე" holds „მიწერე". „write to" is its own word; a prefixed one (ჩა-,
 * გადა-, ამო-…) writes something down for the owner.
 */
/*
 * The tester's 63100 (thread 55573): „უკვე მოგვარდა: თამარ ქავთარაძეს ვკითხე, მან
 * … დაურეკა" — a report of what the owner HAD done — was read as an order to ask
 * her, and she was sent a question. „ვკითხე" (I asked), „ვუთხარი" (I told) and
 * „ვთხოვე" (I asked her to) hold „კითხე", „უთხ" and „თხოვ"; the „ვ" before them
 * is the owner speaking of themselves. The present „გიას ვთხოვ …" (I'm asking Gia,
 * through you) stays an instruction. „უთხრა" and „სთხოვა" tell what somebody
 * else did. None of them is an instruction.
 *
 * #8515 (the tester's 80752 item 1, case 30): „ამ სამ ბროკერს … X-ს გადაეცი,
 * სახელებით" — pass these three names to X — was refused as „no permission":
 * „გადაეცი" and „გადაუგზავნე" (pass on, forward) were not contact verbs, so the
 * owner's order did not count as their yes (D316).
 */
const CONTACT_VERB_RE =
  /(ჰკითხე|(?<!ვ)კითხე|(?<!\p{L})მისწერ[ეო]?|(?<!\p{L})მიწერ[ეო]?|(?<!ვ)უთხარი|(?<!ვ)უთხ(?!რა(?!\p{L}))|(?<!ვ)ს?თხოვ(?:[ეო]|(?!ა))|(?<=ვ)თხოვ(?![ეოა]|\p{L})|დაუკავშირდ|გაუგზავნ|(?<!\p{L})გადაეც(?:ი|ით)?(?!\p{L})|გადაუგზავნ|დამინიშნე|დამიგეგმე|შემახვედრე)|(\b(?:set up|arrange|schedule|book) a meeting with\b|\bask\b|\btell\b|\bwrite to\b|\bmessage\b|\bsend\b[^.!?]*\b(?:to|through|via)\b|\bpass\b[^.!?]*\bto\b)|((?<!\p{L})(?:preg[uú]nta(?:le|les)?|escr[ií]be(?:le|les)|d[ií]le|m[aá]ndale|env[ií]ale|спроси|напиши|свяжись)(?!\p{L}))/iu;

/**
 * „write to nobody", „არავის არ მისწერო" — the verb is present and the
 * sentence says the opposite. Row 215's shape, and the seat's own safety
 * phrasing is what found it.
 */
// #7228 (audit, 63430): „ნოდარს და ლიკუნას მაგაზე არ დაუკავშირდე … ტყუილად არ
// მიწერო" read as an instruction to contact them — only „არავის არ" and „ნუ" were
// known negations. „არ" right before the contact verb takes it back as well.
const NEGATED_CONTACT_RE =
  /(write to (nobody|no one)|(do not|don't|never)\s+(write|message|contact|ask))|(არავის\s+(არ\s+)?(მისწერ|მიწერ|დაუკავშირდ)|(?:^|[\s,.!?])(?:ნუ|არ)\s+(მისწერ|მიწერ|დაუკავშირდ|ჰკითხ|შეეხმიან|გადაეც|გადაუგზავნ))/iu;

/**
 * An instruction is short. Row 104's are 30 to 80 characters; a paragraph that
 * happens to contain „ask" is a goal that mentions asking, not an instruction.
 */
const MAX_INSTRUCTION_CHARS = 160;

/**
 * Does the message carry an un-negated instruction to contact somebody?
 *
 * The CHEAP half of the test, and it runs first on purpose: the phonebook
 * lookup is a query, and this keeps it off every message that cannot possibly
 * need it.
 */
/**
 * The tester's 1101 notes (32982): „მჭირდება სანდო მძღოლი … ჰკითხე ჩემს
 * ნაცნობებს" was read as naming one person, because the phonebook check took
 * every word of the line — „მძღოლი" matched a contact saved with that word.
 * The person an instruction names is in the words AFTER its verb, in the same
 * sentence; a group („my acquaintances", „my contacts") names nobody.
 */
const GROUP_WORDS_RE =
  /^(ჩემს|ჩემი|ჩემ|ყველა|ყველას|ვინმე|ვინმეს|ნაცნობ|მეგობრ|კონტაქტ|ქსელ|ხალხ|ადამიან|my|all|everyone|anyone|someone|friends?|contacts?|network|people|acquaintances?)/iu;

/** The words after an instruction's verb, groups dropped; null when there is no verb. */
export function instructionAddressee(message: string): string | null {
  const match = CONTACT_VERB_RE.exec(message);
  if (match === null) return null;
  const after = message.slice(match.index + match[0].length);
  const sentence = after.split(/[.!?\n]/u)[0] ?? '';
  const named = [datedNameBefore(message.slice(0, match.index)), ...sentence.split(/\s+/u)]
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((w) => w !== '' && !GROUP_WORDS_RE.test(w));
  return named.join(' ');
}

/**
 * The MASTER TEST RUN's QA-001 run 2 (conv 42765): the server's case-1 send
 * passed the owner's WHOLE line to the helper — „მეყავს ნაცნობი… ჰკითხე გიგა
 * ტესტაძეს…", „ask Giga" addressed to Giga. The question is what follows the
 * addressee: in Georgian the addressee ends in the dative „ს" („N1-ს",
 * „ტესტაძეს"); in English the clause opens with „whether" / „if".
 */
const ENGLISH_CLAUSE_RE = /\b(?:whether|if)\b/iu;
const LEADING_LINK_RE = /^[\s,:;—–-]*(?:რომ\s+)?/u;

/**
 * 3928 (GP-052 step 3, seat 181490): „ჰკითხე ნიკა დამხმარე-ას და სოფო
 * დამხმარე-ბს." names TWO people. The first dative word ended the name, so
 * „და სოფო დამხმარე-ბს." became the question Nika was sent. A chain of names
 * („X-ს და Y-ს", „X-სა და Y-ს", „X-ს, Y-ს") is read whole: every name in it,
 * and the question only after the last one.
 */
const NAME_LINK_WORDS: ReadonlySet<string> = new Set(['და', 'and', '&']);
const LINKED_DATIVE_RE = /^[\p{L}\p{N}-]*სა$/u;
/** A dative that may close a sentence: „…დამხმარე-ბს." */
const CHAIN_DATIVE_RE = /^[\p{L}\p{N}-]*ს[,:;.!?]?$/u;
const MAX_NAMES_IN_A_CHAIN = 5;

interface NameChain {
  /** Each name as typed, the dative ending taken off. */
  readonly names: readonly string[];
  /** Index (in the whitespace-kept split) of the first word after the chain. */
  readonly endsAt: number;
}

function withoutDative(words: readonly string[]): string {
  return words
    .join(' ')
    .replace(/[,:;.!?]$/u, '')
    .replace(/-?სა?$/u, '')
    .trim();
}

function endsAName(word: string, next: string | undefined): boolean {
  if (CHAIN_DATIVE_RE.test(word)) return true;
  return LINKED_DATIVE_RE.test(word) && next !== undefined && NAME_LINK_WORDS.has(next);
}

/**
 * After „X-ს," the comma lists another name only when one comes: a word or two
 * ending in the dative, then „და" or another comma („ნიკას, სოფოს და ლევანს").
 * „ტესტაძეს, იცნობს თუ არა" is the question starting, not a second person.
 */
function listsAnotherName(rest: readonly string[]): boolean {
  const words = rest.filter((w) => w.trim() !== '').slice(0, 3);
  const end = words.findIndex((w) => CHAIN_DATIVE_RE.test(w) || LINKED_DATIVE_RE.test(w));
  if (end < 0 || end > 1) return false;
  const closing = words[end];
  return closing.endsWith(',') || NAME_LINK_WORDS.has((words[end + 1] ?? '').toLowerCase());
}

/** The datives that open the words after an instruction's verb, as one chain. */
function georgianNameChain(after: string): NameChain | null {
  const parts = after.split(/(\s+)/u);
  const names: string[] = [];
  let current: string[] = [];
  for (let i = 0; i < parts.length && names.length < MAX_NAMES_IN_A_CHAIN; i += 1) {
    const word = parts[i];
    if (word.trim() === '') continue;
    current.push(word);
    const next = parts.slice(i + 1).find((w) => w.trim() !== '');
    if (!endsAName(word, next)) continue;
    names.push(withoutDative(current));
    current = [];
    const linked = next !== undefined && NAME_LINK_WORDS.has(next.toLowerCase());
    const listed = word.endsWith(',') && listsAnotherName(parts.slice(i + 1));
    if (!linked && !listed) return { names, endsAt: i + 1 };
    if (linked) i = parts.indexOf(next, i + 1);
  }
  return names.length === 0 ? null : { names, endsAt: parts.length };
}

/**
 * 3961 (QA-015 step 3, seat 181480): „შეხვედრა დამინიშნე ნანული მოგონილთან
 * ხვალ 3 საათზე." sent nothing — „set up a meeting" was not an instruction, so
 * the run drew a plan and asked „დავიწყო?" for what the owner had just said.
 * A meeting names its person with „-თან" („with"), not the dative, and what
 * goes to them is the meeting itself — the line without the verb and the name,
 * worded for them by the editor (D711) like every ask.
 */
const MEETING_VERB_RE =
  /(?:დამინიშნე|დამიგეგმე|შემახვედრე)|\b(?:set up|arrange|schedule|book) a meeting with\b/iu;
const WITH_CASE_RE = /^([\p{L}-]+?)ს?თან[,.!?]?$/u;
/** The meeting noun said after the verb is the meeting, not part of the person's name. */
const MEETING_NOUN_RE = /^შეხვედრ\p{L}*$/u;
const MAX_MEETING_NAME_WORDS = 3;
const ENGLISH_NAME_STOP_RE = /^(?:tomorrow|today|tonight|on|at|next|this|in|for|about|to)$/iu;

export function isMeetingInstruction(sentence: string): boolean {
  return MEETING_VERB_RE.test(sentence);
}

interface MeetingParts {
  readonly name: string;
  readonly rest: string;
}

function georgianMeeting(before: string, after: string): MeetingParts | null {
  const all = after.trim().split(/\s+/u);
  const nouns = all.findIndex((w) => !MEETING_NOUN_RE.test(w));
  const lead = all.slice(0, Math.max(nouns, 0));
  const words = all.slice(lead.length);
  const end = words.findIndex((w) => WITH_CASE_RE.test(w));
  if (end < 0 || end >= MAX_MEETING_NAME_WORDS) return null;
  const last = (words[end].match(WITH_CASE_RE) ?? [])[1] ?? '';
  const name = [...words.slice(0, end), last].join(' ').trim();
  const said = [before.trim(), ...lead, ...words.slice(end + 1)].join(' ').trim();
  // „შემახვედრე გიორგისთან" says nothing else: the meeting itself is what is asked.
  const rest = said.split(/\s+/u).some((w) => MEETING_NOUN_RE.test(w))
    ? said
    : `შეხვედრა ${said}`.trim();
  return name === '' ? null : { name, rest };
}

function englishMeeting(after: string): MeetingParts | null {
  const words = after.trim().split(/\s+/u);
  const end = words.findIndex((w, i) => i > 0 && ENGLISH_NAME_STOP_RE.test(w));
  const take = Math.min(end < 0 ? words.length : end, MAX_MEETING_NAME_WORDS);
  const name = words
    .slice(0, take)
    .join(' ')
    .replace(/[,.!?]$/u, '')
    .trim();
  const rest = `a meeting ${words.slice(take).join(' ')}`.trim();
  return name === '' ? null : { name, rest };
}

function meetingParts(sentence: string): MeetingParts | null {
  const match = MEETING_VERB_RE.exec(sentence);
  if (match === null) return null;
  const before = sentence.slice(0, match.index);
  const after = sentence.slice(match.index + match[0].length);
  return /with/iu.test(match[0]) ? englishMeeting(after) : georgianMeeting(before, after);
}

/** Every person an instruction names, as typed; empty when none can be told apart. */
export function instructionNames(sentence: string): string[] {
  if (isMeetingInstruction(sentence)) {
    const meeting = meetingParts(sentence);
    return meeting === null ? [] : [meeting.name];
  }
  const match = CONTACT_VERB_RE.exec(sentence);
  if (match === null) return [];
  const before = datedNameBefore(sentence.slice(0, match.index));
  if (before !== '') return [before];
  const after = sentence.slice(match.index + match[0].length);
  const english = ENGLISH_CLAUSE_RE.exec(after);
  if (english !== null) {
    return after
      .slice(0, english.index)
      .split(/\s*(?:,|\band\b|&)\s*/iu)
      .map((name) => name.trim())
      .filter((name) => name !== '');
  }
  return [...(georgianNameChain(after)?.names ?? [])].filter((name) => name !== '');
}

/** What the owner wants asked, without „ask <name>"; null when it cannot be told apart. */
export function instructionQuestion(sentence: string): string | null {
  if (isMeetingInstruction(sentence)) return clauseOrNull(meetingParts(sentence)?.rest ?? '');
  const match = CONTACT_VERB_RE.exec(sentence);
  if (match === null) return null;
  const after = sentence.slice(match.index + match[0].length);
  const english = ENGLISH_CLAUSE_RE.exec(after);
  if (english !== null) return clauseOrNull(after.slice(english.index));
  if (datedNameBefore(sentence.slice(0, match.index))) return clauseOrNull(after);
  const chain = georgianNameChain(after);
  if (chain === null) return null;
  return clauseOrNull(after.split(/(\s+)/u).slice(chain.endsAt).join(''));
}

/**
 * 3928: „სანტექნიკოსი მჭირდება, ჰკითხე X-ს და Y-ს." carries no question after
 * the names — the need is said BEFORE the verb. That need, in the owner's own
 * words, is what the helpers are asked; never the whole line with „ask X" in it.
 */
export function instructionNeed(sentence: string): string | null {
  const match = CONTACT_VERB_RE.exec(sentence);
  if (match === null) return null;
  const beforeVerb = sentence.slice(0, match.index);
  if (datedNameBefore(beforeVerb) !== '') return null;
  const need = beforeVerb.replace(/[\s,;:—–-]+$/u, '').trim();
  return need === '' || isOnlyAgreement(need) ? null : need;
}

/**
 * 1919's side notes (tester box 58774, thread 51845): the owner answered the
 * run's „ნინოს მივწერო…?" with „კი, მიწერე ნინოს". Before the verb stood only
 * „კი", so „კი" was taken for the need: it would have been Nino's whole
 * question, and it became the goal's title („შევაჩერე: კი, მიწერე ნინოს").
 * A yes is the owner agreeing to a question asked earlier, not the question.
 */
const AGREEMENT_ONLY_RE =
  /^(?:(?:კი|დიახ|ხო|ჰო|კარგი|კაი|კარგით|აბა|მაშინ|yes|yeah|yep|ok|okay|sure|then|да|ладно|хорошо|sí|vale)[\s,!.]*)+$/iu;

function isOnlyAgreement(text: string): boolean {
  return AGREEMENT_ONLY_RE.test(text);
}

/**
 * The tester's 45155 (T2509): the person an instruction names, as typed, with
 * the dative „ს" taken off („ჰკითხე გელა გამოგონილს იცნობს…" → „გელა
 * გამოგონილ"). Only a fallback for when the owner's own label cannot be read;
 * null when the name cannot be told apart from the question.
 */
export function instructionNamed(sentence: string): string | null {
  return instructionNames(sentence)[0] ?? null;
}

function clauseOrNull(text: string): string | null {
  const clause = text.replace(LEADING_LINK_RE, '').trim();
  return clause === '' ? null : clause;
}

/**
 * #961 (the tester's 1142, 37509): the tapped button „გიას ვთხოვ ამ კვირაში
 * შეხვედრის დანიშვნას" names Gia BEFORE its verb — Georgian puts the person
 * first as often as not („ნინოს ჰკითხე"). Only the one word right before the
 * verb, and only in the dative (-ს) a person takes there: the 1101 note above
 * is why the rest of the line before the verb stays out.
 */
/**
 * 3928 run 2 (seat 182043, conv 48361): „…აბაზანაში მილი გამდის. ჰკითხე X-ს
 * და Y-ს." read the verb „გამდის" as the person, so nobody was asked. A word
 * the previous sentence or clause ends on is not the verb's person.
 */
const CLAUSE_END_RE = /[.,!?;:…]$/u;

function datedNameBefore(beforeVerb: string): string {
  const words = beforeVerb.trim().split(/\s+/u);
  const lastRaw = words[words.length - 1] ?? '';
  // A verb glued to its prefix („ვთხოვ") leaves the person as the word before.
  const raw = lastRaw === 'ვ' || lastRaw === '' ? (words[words.length - 2] ?? '') : lastRaw;
  if (CLAUSE_END_RE.test(raw)) return '';
  const word = raw.replace(/[^\p{L}]+$/gu, '');
  return /^\p{Script=Georgian}{2,}ს$/u.test(word) ? word.slice(0, -1) : '';
}

/**
 * The tester's 44132 (case 1, owner conversation 42009) and Misho's ruling of
 * 7 Oct (a server rule, D625): „I have an acquaintance G … I am writing a
 * business plan … ჰკითხე Nodar Testidze-ს, იცნობს თუ არა გიას" — context first,
 * the instruction last — was 173 characters, so it was not an instruction and
 * the run drew an approve card for it. For the approve card only — the other
 * readers of an instruction keep the short-line rule — a longer line is judged
 * by the sentence that carries the verb.
 */
const SENTENCE_RE = /[^.!?\n]+[.!?]?/gu;

/** 1687: does this sentence carry an instruction to contact somebody? */
export function isInstructionSentence(sentence: string): boolean {
  return CONTACT_VERB_RE.test(sentence);
}

export function instructionSentence(text: string): string {
  if (text.length <= MAX_INSTRUCTION_CHARS) return text;
  return (text.match(SENTENCE_RE) ?? []).find((part) => CONTACT_VERB_RE.test(part))?.trim() ?? text;
}

/**
 * 2906 (MTR #7): „ჯერ მაჩვენე, რას მისწერ X-ს" asks to SEE the message first;
 * it got the dead-end „the question was not sent", and the server could have
 * sent it unasked. A preview request is not an instruction to send.
 */
const PREVIEW_RE =
  /(მაჩვენე|ჯერ\s+მითხარი,?\s+რას|\b(?:show|let)\s+me\s+(?:first\s+)?(?:see\s+)?what\b|\bfirst\s+show\s+me\b|\bpreview\b|покажи|muéstrame)/iu;

/** 2906: does the line ask to SEE the message first? Then nothing is sent on it. */
export function asksForAPreview(line: string): boolean {
  return PREVIEW_RE.test(line);
}

/**
 * Thread 74582 (30 Oct): „…X-ის ასისტენტს ვკითხო, ხომ არ იცის …?" and the
 * owner's „კი". The assistant's question is an offer in the first person —
 * „shall I ask" — which CONTACT_VERB_RE, built for the owner's orders, does
 * not read. Only the question's own last sentence counts, and it must end in
 * a question mark.
 */
const OFFER_TO_CONTACT_RE =
  /((?<!\p{L})(?:ვ?ჰ?კითხო|ვკითხავ|მივწერო?|გავუგზავნო|გავუგზავნი|ვაგზავნი|დავუკავშირდე|ვთხოვო|შევეხმიანო)(?!\p{L}))|(\b(?:shall|should|can|may) i (?:ask|write to|message|contact)\b|\bwant me to (?:ask|write to|message|contact)\b)|((?<!\p{L})(?:le|les) (?:pregunto|escribo)(?!\p{L})|спросить|написать)/iu;
/** „არავის მივწერო?" — and the „ხომ არ ვკითხო?" form is still an offer, so a bare „არ" is not a no. */
const OFFER_NEGATED_RE = /((?<!\p{L})(?:არავის|ნუ)(?!\p{L}))|(\b(?:nobody|no one)\b)/iu;
const QUESTION_SENTENCE_RE = /[^.!?\n]*[?？]\s*$/u;

/** The closing question of a line, or '' when the line does not end in one. */
export function closingQuestion(line: string): string {
  return line.trim().match(QUESTION_SENTENCE_RE)?.[0].trim() ?? '';
}

/** Is this question the assistant's offer to contact somebody? */
export function offersToContact(question: string): boolean {
  return OFFER_TO_CONTACT_RE.test(question) && !OFFER_NEGATED_RE.test(question);
}

/** #8517: does the line tell Netai NOT to contact somebody („ნუ მისწერ", „don't ask")? */
export function forbidsContact(line: string): boolean {
  return NEGATED_CONTACT_RE.test(line);
}

export function looksLikeContactInstruction(message: string): boolean {
  const text = message.trim();
  if (text.length === 0 || text.length > MAX_INSTRUCTION_CHARS) return false;
  if (asksForAPreview(text)) return false;
  if (!CONTACT_VERB_RE.test(text)) return false;
  // #8649: a line that stops before saying what to ask is not an instruction yet.
  if (looksUnfinished(text)) return false;
  return !NEGATED_CONTACT_RE.test(text);
}
