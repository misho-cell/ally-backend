/**
 * 5413 (Giorgi, 16 Oct): the case-details panel shows two or three plain
 * sentences about the case — what the owner wants, who it is for, and where it
 * stands now. The goal's brief cannot be shown as it is: it is the assistant's
 * working note (tool names, „next check in 24 hours"), a third of goals have
 * none, and its median is 554 characters. So the server writes the description
 * from the brief and the latest messages, and rewrites it after each run.
 *
 * OFF until Misho's yes on the exact prompt below (D44).
 */
export const CASE_DESCRIPTION_ON = false;

export const CASE_DESCRIPTION_MAX_CHARS = 420;
const MIN_CHARS = 20;
const MAX_SENTENCES = 3;

export function caseDescriptionPrompt(language: string): string {
  return (
    'Below is one case the owner is working on with their assistant: its title, the ' +
    "assistant's working notes and the latest messages. Write 2 or 3 short plain sentences " +
    `for the owner, in ${language} only: what they want, who it is for, and where it stands ` +
    'now. Use only facts written below. Speak to the owner as "you". Other people are reached ' +
    'through their assistants: when you name who was written to, say "<name>\'s assistant". ' +
    'No tool names, no internal notes, no phone numbers, no dates or hours, no quotes, no ' +
    'lists. Answer with the sentences only.'
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
export function cleanCaseDescription(raw: string): string | null {
  const text = raw.replace(/\s+/gu, ' ').trim();
  if (text.length < MIN_CHARS || text.length > CASE_DESCRIPTION_MAX_CHARS) return null;
  if (LIST_MARK_RE.test(raw) || PHONE_LIKE_RE.test(text) || TOOL_NAME_RE.test(text)) return null;
  const sentences = text.split(/(?<=[.!?。])\s+/u).filter((s) => s.trim() !== '');
  return sentences.length > MAX_SENTENCES ? null : text;
}
