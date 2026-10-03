/**
 * The tester's 1111 (L7, finding 2): since a92775e Claude's own answer is the
 * reply in a turn that ends with buttons or a plan, and those answers ran long
 * (median first reply 607 characters, one 1,302). The founder wants one phone
 * screen, and a prompt sentence asking for it changed nothing. So a long draft
 * is shortened by the final writer, with every link kept; when a link would be
 * lost the draft goes out whole, because a short reply without the page is
 * worse than a long one with it.
 */
export const LONG_DRAFT_CHARS = 600;

export const SHORTEN_DRAFT_PROMPT =
  'Shorten the assistant reply below so it fits one phone screen: a few short lines. Keep, ' +
  'exactly as written, every person’s name, every link, phone number and e-mail, and the plan ' +
  'and its closing question if it has them. Drop repetition, explanations of method and filler. ' +
  'Same language as the reply; in Georgian address the owner as „შენ", never „თქვენ". Write only ' +
  'the shortened reply, nothing before or after it.';

const LINK_RE = /https?:\/\/\S+|⟦own⟧[^⟦]*⟦\/own⟧/gu;

/** Every link and wrapped number of the draft, as the shortened text must carry them. */
export function linksOf(text: string): readonly string[] {
  return text.match(LINK_RE) ?? [];
}

/** The shortened text, when it is shorter and lost nothing that must stay; otherwise null. */
export function acceptShortened(draft: string, shortened: string | null): string | null {
  const text = shortened?.trim() ?? '';
  if (text === '' || text.length >= draft.length) return null;
  return linksOf(draft).every((link) => text.includes(link)) ? text : null;
}
