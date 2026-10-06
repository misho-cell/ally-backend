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
  /** „Do you know a good plumber?" — a person or a lead. */
  Know = 'know',
  /** „Can you help me with …?" — the original three buttons. */
  Help = 'help',
  /** „Who / what / when …?" — no fixed answer; only „later". */
  Open = 'open',
  /** „Are you free tomorrow?" — yes / no. */
  YesNo = 'yes_no',
}

const KNOW_RE =
  /იცნობ|ხომ არ იცი|ვინმე ხომ|მირჩევ|ურჩევ|\b(know|recommend|suggest)\b|знае|знаком|посовет|порекоменд|conoc|recomiend|sabes de/iu;
const HELP_RE = /დამეხმარ|დახმარებ|\bhelp\b|помо[гчж]|ayud/iu;
const OPEN_RE =
  /^(ვინ|რა |რას |რამ |როდის|სად|როგორ|რამდენ|რატომ|რომელ|who\b|what\b|when\b|where\b|how\b|why\b|which\b|кто|что|когда|где|как|почему|какой|сколько|qui[eé]n|qu[eé]\b|cu[aá]ndo|d[oó]nde|c[oó]mo|por qu[eé]|cu[aá]l)/iu;

export function askKindOf(question: string): AskKind {
  const said = question.trim().replace(/^[¿¡"„«\s]+/u, '');
  if (KNOW_RE.test(said)) return AskKind.Know;
  if (HELP_RE.test(said)) return AskKind.Help;
  if (OPEN_RE.test(said)) return AskKind.Open;
  return AskKind.YesNo;
}
