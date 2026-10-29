/**
 * 5413 (Giorgi, 16 Oct): the case-details panel shows two or three plain
 * sentences about the case — what the owner wants, who it is for, and where it
 * stands now. The goal's brief cannot be shown as it is: it is the assistant's
 * working note (tool names, „next check in 24 hours"), a third of goals have
 * none, and its median is 554 characters. So the server writes the description
 * from the brief and the latest messages, and rewrites it after each run.
 *
 * On since 16 Oct 23:xxZ: the founder's yes on its text (D794, box 62899) and
 * Misho's word to ship every finished task.
 */
export const CASE_DESCRIPTION_ON = true;

export const CASE_DESCRIPTION_MAX_CHARS = 420;
const MIN_CHARS = 20;
const MAX_SENTENCES = 2;

/**
 * #6535 (Giorgi, via the prompt chat, box 70061; Misho's yes 20 Oct): the
 * description is the goal only — „თქვენი მიზანია გიორგი დაუკავშიროთ თემურ
 * ბოლოთაშვილთან, რომელიც თბილისის არქიტექტურის სამსახურის უფროსია." Never the
 * progress, the helpers or their answers.
 */
/**
 * Rule 3 (Misho, 29 Oct, Giorgi's screen): „მიზანი: თქვენ გჭირდებათ ადამიანი,
 * რომელმაც თქვენი კედლები დამლესოს…" — a label in front, the formal „თქვენ"
 * (Netai speaks to its owner as „შენ" everywhere else) and a stiff sentence.
 * Raising the number rewrites every description written under rule 2.
 */
export const CASE_DESCRIPTION_RULE = 3;

export function caseDescriptionPrompt(language: string): string {
  return (
    'Below is one case the owner is working on with their assistant: its title and how it began. ' +
    `Write one or two short, natural sentences in ${language} only, as the assistant talking ` +
    'to the owner: what they are looking for, who it is for and why. Write it the way a person ' +
    'would say it, plainly. Speak to the owner informally: in Georgian შენ, შენი, გჭირდება, ' +
    'never თქვენ or a -თ verb form. No label in front of it (no „მიზანი:", no „Goal:"). ' +
    'Nothing else: no progress, no helpers or go-betweens, no answers, no statuses. ' +
    'Use only facts written below. No tool names, no phone numbers, no dates or hours, no ' +
    'quotes, no lists. Answer with the sentences only.'
  );
}

export interface CaseFacts {
  readonly title: string | null;
  readonly brief: string | null;
  /** Oldest first, each already labelled „owner:" or „assistant:". */
  readonly lines: readonly string[];
}

const FACT_LINE_MAX_CHARS = 400;

/** The model's input: title, notes and the latest lines, each cut to a bounded size. */
export function caseFactsText(facts: CaseFacts): string {
  const parts = [
    facts.title ? `Title: ${facts.title}` : null,
    facts.brief ? `Working notes: ${facts.brief.slice(0, FACT_LINE_MAX_CHARS * 2)}` : null,
    facts.lines.length > 0
      ? `Latest messages:\n${facts.lines.map((l) => l.slice(0, FACT_LINE_MAX_CHARS)).join('\n')}`
      : null,
  ];
  return parts.filter((p): p is string => p !== null).join('\n\n');
}

const PHONE_LIKE_RE = /\+?\d[\d\s-]{6,}\d/u;
const TOOL_NAME_RE = /\b[a-z]+_[a-z_]+\b/u;
const LIST_MARK_RE = /^\s*(?:[-*•]|\d+[.)])\s+/mu;

/**
 * The model's answer as it may be shown, or null when it is not a description:
 * empty, too long, a list, more than three sentences, or carrying a number or a
 * tool name it was told never to write.
 */
const LEADING_LABEL_RE = /^(?:მიზანი|goal|цель|objetivo)\s*[:：-]\s*/iu;

export function cleanCaseDescription(raw: string): string | null {
  const text = raw.replace(/\s+/gu, ' ').trim().replace(LEADING_LABEL_RE, '');
  if (text.length < MIN_CHARS || text.length > CASE_DESCRIPTION_MAX_CHARS) return null;
  if (LIST_MARK_RE.test(raw) || PHONE_LIKE_RE.test(text) || TOOL_NAME_RE.test(text)) return null;
  const sentences = text.split(/(?<=[.!?。])\s+/u).filter((s) => s.trim() !== '');
  return sentences.length > MAX_SENTENCES ? null : text;
}
