/**
 * #1948 (Lika, iPhone, 6 Oct): every incoming question came with the same
 * three buttons — „Yes, I can help / I can't help with this / I'll answer
 * later" — under „Are you free tomorrow?", „Do you know a good plumber?" and
 * „Do you like Italian cuisine?". „Yes, I can help" answers none of them. The
 * buttons follow what kind of question it is.
 *
 * #8779 group 4 (the founder, 4 Nov): no fixed word lists. The kind was read
 * off the question's words; the asking model now says it (ask_contact's
 * `kind`), and it is stored with the ask (task_asks.ask_kind). An ask with no
 * kind gets the open set — only „later" — which fits any question: the text
 * field is always there.
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

const ASK_KINDS: readonly string[] = Object.values(AskKind);

/** The kind the model gave, or the open set when it gave none or something else. */
export function askKindFrom(raw: unknown): AskKind {
  return typeof raw === 'string' && ASK_KINDS.includes(raw) ? (raw as AskKind) : AskKind.Open;
}

export const ASK_KIND_FIELD = {
  type: 'string',
  enum: ASK_KINDS,
  description:
    'What kind of question this is, for the reader’s reply buttons: intro (asks them to ' +
    'introduce the owner to someone — wherever in the message that is asked), know (whether ' +
    'they know a person or a lead), help (asks them to help with something), yes_no (a plain ' +
    'yes/no question), open (who / what / when… — no fixed answer). Leave it out if unsure: ' +
    'open fits any question.',
} as const;
