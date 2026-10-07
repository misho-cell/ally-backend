/**
 * #1948 (Lika, iPhone, 6 Oct): every incoming question came with the same
 * three buttons — „Yes, I can help / I can't help with this / I'll answer
 * later" — under „Are you free tomorrow?", „Do you know a good plumber?" and
 * „Do you like Italian cuisine?". „Yes, I can help" answers none of them.
 *
 * The buttons now follow what kind of question it is. Read by words, not by a
 * model call: it runs on every send, and a wrong guess costs a button, never
 * the question — the text field is always there.
 */
export enum AskKind {
  /** „Will you introduce me to G?" — yes, I'll introduce you / I can't. */
  Intro = 'intro',
  /** „Do you know a good plumber?" — a person or a lead. */
  Know = 'know',
  /** „Can you help me with …?" — the original three buttons. */
  Help = 'help',
  /** „Who / what / when …?" — no fixed answer; only „later". */
  Open = 'open',
  /** „Are you free tomorrow?" — yes / no. */
  YesNo = 'yes_no',
}

/**
 * #2185 (the founder's own screen, 7 Oct): „Do you know G? If yes, will you
 * introduce me?" got „Yes, I know someone / No, I don't know anyone" — no
 * button said „yes, I'll introduce you". An introduction is its own kind,
 * wherever in the message it is asked.
 */
const INTRO_RE =
  /გამაცნ|გააცნ|გაგვაცნ|დამაკავშირ|დაგვაკავშირ|introduc|put (?:me|us) in touch|connect (?:me|us)|познаком|представ(?:ишь|ить)|presenta(?:r|rme|rnos|s)\b/iu;

const KNOW_RE =
  /იცნობ|ხომ არ იცი|ვინმე ხომ|მირჩევ|ურჩევ|\b(know|recommend|suggest)\b|знае|знаком|посовет|порекоменд|conoc|recomiend|sabes de/iu;
const HELP_RE = /დამეხმარ|დახმარებ|\bhelp\b|помо[гчж]|ayud/iu;
// A Georgian word ends where the next Georgian letter does not follow: „ვინ"
// opens an open question, „ვინმე" („anyone") does not.
const OPEN_RE =
  /^(ვინ(?![ა-ჰ])|ვის(?![ა-ჰ])|რა |რას |რამ |როდის|სად|როგორ|რამდენ|რატომ|რომელ(?!იმე)|who\b|what\b|when\b|where\b|how\b|why\b|which\b|кто|что|когда|где|как|почему|какой|сколько|qui[eé]n|qu[eé]\b|cu[aá]ndo|d[oó]nde|c[oó]mo|por qu[eé]|cu[aá]l)/iu;

const SENTENCE_END_RE = /(?<=[.!?…])\s+/u;

/**
 * #2185 (Lika's follow-up, 41988): „I am opening a mall … Which supplier would
 * you recommend?" was read by its first words and its „recommend", and got
 * „Yes, I know someone". The buttons answer the question the message ends on.
 */
function lastQuestion(text: string): string {
  const sentences = text.split(SENTENCE_END_RE).filter((part) => part.trim() !== '');
  const asked = sentences.filter((part) => part.trim().endsWith('?'));
  return (asked[asked.length - 1] ?? text).trim().replace(/^[¿¡"„«\s]+/u, '');
}

export function askKindOf(question: string): AskKind {
  if (INTRO_RE.test(question)) return AskKind.Intro;
  const said = lastQuestion(question);
  // „Which supplier would you recommend?" asks for a name — the text field answers it.
  if (OPEN_RE.test(said)) return AskKind.Open;
  if (KNOW_RE.test(said)) return AskKind.Know;
  if (HELP_RE.test(said)) return AskKind.Help;
  return AskKind.YesNo;
}
