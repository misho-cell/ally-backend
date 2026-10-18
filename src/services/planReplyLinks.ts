/**
 * The tester's box 66992 (thread 58876, 18 Oct): the plan sentence read
 * „…შენი ბიზნეს სესხი (http://globalcredit.com.ge/product/Business-Loan)ს
 * განაცხადს დააჩქარებს" — another bank's product page in the middle of the
 * owner's need, in the one sentence the owner approves. A plan is one human
 * sentence, assistant to assistant (D663); it never needs a web address. So a
 * plan reply keeps the words of a link and loses the address.
 */
const MARKDOWN_LINK_RE = /\[([^\]\n]+)\]\((?:https?:\/\/|www\.)[^)\s]*\)/giu;
const BRACKETED_URL_RE = /[^\S\n]*\((?:https?:\/\/|www\.)[^)\s]*\)/giu;
/** A bare address ends before the sentence's own closing mark. */
const BARE_URL_RE = /[^\S\n]*(?:https?:\/\/|www\.)[^\s)]*[^\s).,!?;:…]/giu;
const DOUBLE_SPACE_RE = /[^\S\n]{2,}/gu;
const SPACE_BEFORE_MARK_RE = /[^\S\n]+([.,!?;:…])/gu;

/** The plan reply with every web address taken out and the words around it kept. */
export function withoutWebLinks(reply: string): string {
  const cut = reply
    .replace(MARKDOWN_LINK_RE, '$1')
    .replace(BRACKETED_URL_RE, '')
    .replace(BARE_URL_RE, '');
  if (cut === reply) return reply;
  return cut.replace(DOUBLE_SPACE_RE, ' ').replace(SPACE_BEFORE_MARK_RE, '$1');
}
