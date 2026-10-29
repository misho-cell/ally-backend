import { isSmallTalk } from './smallTalk';

/**
 * 3433 (QA-026, 8 Oct, fresh pairs): a helper's typed no was stored as an
 * ANSWER. „აზრზე არ ვარ" (owner 180219) and „არა, ვერ მოვახერხებ, სხვას
 * ჰკითხოს." (owner 180223) left the ask answered; only the decline button
 * recorded a decline. The asker was told politely either way, but the ask's
 * state, and everything that counts declines, was wrong.
 *
 * A short line that says „I don't know / I can't" and gives nothing else is a
 * decline. A line with a number, a „but", or anything long is an answer that
 * may carry something, and stays one.
 */
const TYPED_DECLINE_MAX_CHARS = 100;

const REFUSAL_RE = new RegExp(
  [
    'აზრზე\\s+არ\\s+ვარ',
    'წარმოდგენა\\s+არ\\s+მაქვს',
    'არ\\s+ვიცნობ',
    'არ\\s+ვიცი',
    'ვერ\\s+დაგეხმარ',
    'ვერ\\s+მოვახერხებ',
    'ვერ\\s+გეტყვი',
    'ვერავის\\s+(?:ვიცნობ|გირჩევ|გეტყვი)',
    'არავინ\\s+(?:მყავს|ვიცი|მახსენდება)',
    // 4093: busy, or „leave me alone", closes the asking too.
    'არ\\s+მცალია',
    'დამანებე\\s+თავი',
    'თავი\\s+დამანებე',
    'მომეშვი',
    'ნუ\\s+მწერ',
    'leave\\s+me\\s+alone',
    "(?:i['’]?m|i\\s+am)\\s+(?:too\\s+)?busy",
    'not\\s+interested',
    'отстань',
    'не\\s+пиши',
    'мне\\s+некогда',
    'déjame\\s+en\\s+paz',
    'estoy\\s+ocupad[oa]',
    'no\\s+idea',
    "(?:don['’]?t|do\\s+not)\\s+know",
    "can['’]?t\\s+help",
    'cannot\\s+help',
    'не\\s+знаю',
    'понятия\\s+не\\s+имею',
    'не\\s+смогу',
    'не\\s+могу\\s+помочь',
    'no\\s+sé',
    'no\\s+(?:lo\\s+)?conozco',
    'no\\s+puedo\\s+ayudar',
  ].join('|'),
  'iu',
);

/** Something in the line that may be the help after all. */
const CARRIES_SOMETHING_RE = /\d|მაგრამ|თუმცა|\bbut\b|\bно\b|\bpero\b/iu;

/**
 * #8154 FAILED on Giorgi's account (29 Oct 19:11 Tbilisi, G-208): „ქართველი
 * ფეხბურთელები არ ვიცი. შემიძლია კალათბურთელი შემოგთავაზო" — a no to the
 * question and an offer of something else, with no „but". The ask was marked
 * declined and the route closed. An offer word, or a second sentence that is
 * not itself a no, keeps it an answer.
 */
const OFFERS_SOMETHING_RE =
  /შემიძლია|შემოგთავაზ|გთავაზობ|შემიძლი|\bcan\s+offer\b|\bcould\s+offer\b|\bi\s+can\s+(?:suggest|introduce|connect)\b|\bi\s+know\s+an?\b|могу\s+предложить|могу\s+познакомить|puedo\s+ofrecer|puedo\s+presentar/iu;
const SENTENCE_RE = /[^.!?…\n]+/gu;
/** A wish after a no is still a no: „წარმატებები!", „good luck". */
const WISH_RE = /წარმატ|იმედია\s+იპოვ|good\s+luck|best\s+of\s+luck|удач|suerte/iu;
const MIN_SENTENCE_CHARS = 8;

function laterSentenceCarriesSomething(said: string): boolean {
  const sentences = (said.match(SENTENCE_RE) ?? []).map((x) => x.trim()).filter(Boolean);
  return sentences
    .slice(1)
    .some(
      (x) =>
        x.length >= MIN_SENTENCE_CHARS &&
        !REFUSAL_RE.test(x) &&
        !isSmallTalk(x) &&
        !WISH_RE.test(x),
    );
}

export function isTypedDecline(message: string): boolean {
  const said = message.trim();
  if (said.length === 0 || said.length > TYPED_DECLINE_MAX_CHARS) return false;
  if (!REFUSAL_RE.test(said) || CARRIES_SOMETHING_RE.test(said)) return false;
  return !OFFERS_SOMETHING_RE.test(said) && !laterSentenceCarriesSomething(said);
}
