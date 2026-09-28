import type { RunLanguage } from './runLanguage';

/**
 * ROW 73 — WHAT A CARD SAYS BEFORE ANYBODY TAPS IT.
 *
 * ⚠️ THREE DIFFERENT CARDS ABOUT THREE DIFFERENT PEOPLE LOOKED IDENTICAL.
 *
 * Ninia's screenshots, 28 September: her updates screen showed
 * „debrief · მიზანი #3995" twice and „debrief · მიზანი #3137" three times, and
 * her question was the right one — „from 'Goal #3367' we cannot tell what it
 * is about".
 *
 * The first thing to check was whether those were duplicates. They are not.
 * Read from the table, #3137's three cards are Giorgi Abramishvili, Tornike
 * Abuladze and Lika Ose — three different people who have not answered, and
 * #1123's two are two different questions on one goal. THE DATA WAS RIGHT AND
 * THE SCREEN COULD NOT SHOW IT.
 *
 * ════════ WHY THE APP COULD NOT SIMPLY RENDER MORE ════════
 *
 * `GET /updates` already returns each payload untouched, so the words were
 * reaching them. But there is no field to render: a `debrief` carries
 * `who`/`why`, a `goal_question` carries `question`, a `goal_feedback` carries
 * `prompt`, `found` and `no_luck` carry `summary`, `weekly_summary` carries
 * `text` — and `search_followup` carries nothing at all but a `search_id`.
 *
 * Ten kinds, nine shapes. An app cannot draw one card from that without
 * special-casing every kind and then learning about the eleventh from a
 * screenshot. So the shape is the server's job: every card now carries a
 * `title` and a `detail`, whatever kind it is.
 *
 * ════════ COMPUTED WHEN READ, NOT WHEN QUEUED ════════
 *
 * Six hundred and six cards are already queued. A field written at queue time
 * would leave every one of them blank, and the screen Ninia is looking at is
 * made of exactly those rows — the fix would have shipped and changed nothing
 * she can see for weeks.
 *
 * It also lets the title follow the READER. A person's language is decided
 * from their own words and can be revised between the day a card is queued and
 * the day it is read.
 */

/** What a card shows before it is opened. Both fields are always present. */
export interface CardHeading {
  /** What this is about — the goal's own words where there is a goal. */
  readonly title: string;
  /** One line saying what is being asked or offered. May be empty. */
  readonly detail: string;
}

/**
 * The label for a card that does not belong to a goal, or whose goal has no
 * readable title.
 *
 * ⚠️ NOT „debrief". The kind is a word from our schema and it was on her
 * screen — „goal_question · მიზანი #4192" is what a person was shown. These
 * are the same ten kinds said in a way somebody can read.
 */
const KIND_LABEL: Readonly<Record<RunLanguage, Readonly<Record<string, string>>>> = {
  ka: {
    debrief: 'პასუხი ჯერ არ მოსულა',
    goal_question: 'შენი პასუხი სჭირდება',
    goal_feedback: 'ერთი კითხვა დასრულებულზე',
    search_followup: 'ძებნის გაგრძელება',
    weekly_summary: 'შენი კვირა',
    chorus_ask: 'მოწვევის კითხვა ელოდება',
    intro_expired: 'გაცნობის მოთხოვნას ვადა გაუვიდა',
    thanks_loop: 'მადლობა შენი დახმარებისთვის',
    no_luck: 'ვერაფერი ვიპოვე',
    found: 'რაღაც ვიპოვე',
  },
  en: {
    debrief: 'Still no answer',
    goal_question: 'Needs your answer',
    goal_feedback: 'One question about something you finished',
    search_followup: 'Following up a search',
    weekly_summary: 'Your week',
    chorus_ask: 'An invite question is waiting',
    intro_expired: 'An introduction request expired',
    thanks_loop: 'Thank you for the help',
    no_luck: 'Nothing found',
    found: 'Something found',
  },
  ru: {
    debrief: 'Ответа пока нет',
    goal_question: 'Нужен ваш ответ',
    goal_feedback: 'Один вопрос о завершённом',
    search_followup: 'Продолжение поиска',
    weekly_summary: 'Ваша неделя',
    chorus_ask: 'Вопрос о приглашении ждёт',
    intro_expired: 'Запрос на знакомство истёк',
    thanks_loop: 'Спасибо за помощь',
    no_luck: 'Ничего не найдено',
    found: 'Кое-что найдено',
  },
  es: {
    debrief: 'Aún sin respuesta',
    goal_question: 'Necesita tu respuesta',
    goal_feedback: 'Una pregunta sobre algo que terminaste',
    search_followup: 'Seguimiento de una búsqueda',
    weekly_summary: 'Tu semana',
    chorus_ask: 'Una pregunta de invitación espera',
    intro_expired: 'Una solicitud de presentación caducó',
    thanks_loop: 'Gracias por la ayuda',
    no_luck: 'No se encontró nada',
    found: 'Se encontró algo',
  },
};

/** „<name> has not answered yet" — the one line a debrief card is actually about. */
const WAITING_ON: Readonly<Record<RunLanguage, (who: string) => string>> = {
  ka: (who) => `${who} ჯერ არ გიპასუხა.`,
  en: (who) => `${who} has not answered yet.`,
  ru: (who) => `${who} пока не ответил.`,
  es: (who) => `${who} aún no ha respondido.`,
};

const UNTITLED: Readonly<Record<RunLanguage, string>> = {
  ka: 'უსათაურო მიზანი',
  en: 'Untitled goal',
  ru: 'Цель без названия',
  es: 'Objetivo sin título',
};

/** One line, never a paragraph: this sits under a title on a list. */
const MAX_DETAIL_CHARS = 200;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function oneLine(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length <= MAX_DETAIL_CHARS ? flat : `${flat.slice(0, MAX_DETAIL_CHARS - 1)}…`;
}

/**
 * The line under the title, taken from whichever field this kind happens to
 * carry its words in.
 *
 * ⚠️ `why` IS NOT USED, though a debrief carries one. It is written in English
 * by the code that queues it („the question sent to X has had no answer for 3
 * days") and it would be the only English sentence on a Georgian reader's
 * screen. The name is the part that matters and the sentence around it is
 * cheaper to say here, in their language, than to translate.
 */
function detailOf(kind: string, payload: Record<string, unknown>, language: RunLanguage): string {
  const who = text(payload.who);
  if (kind === 'debrief' && who !== '') return oneLine(WAITING_ON[language](who));
  const words =
    text(payload.question) ||
    text(payload.prompt) ||
    text(payload.summary) ||
    (kind === 'debrief' || kind === 'chorus_ask' || kind === 'intro_expired' ? who : '');
  return oneLine(words);
}

/** „2 active goals · 1 waiting on you" — the whole week in one line. */
const WEEK_LINE: Readonly<Record<RunLanguage, (goals: number, waiting: number) => string>> = {
  ka: (g, w) => (w > 0 ? `${g} აქტიური მიზანი · ${w} გელოდება შენს პასუხს` : `${g} აქტიური მიზანი`),
  en: (g, w) => (w > 0 ? `${g} active goals · ${w} waiting on you` : `${g} active goals`),
  ru: (g, w) => (w > 0 ? `${g} активных целей · ${w} ждут вашего ответа` : `${g} активных целей`),
  es: (g, w) =>
    w > 0 ? `${g} objetivos activos · ${w} esperan tu respuesta` : `${g} objetivos activos`,
};

/**
 * The summary's one line, counted from the card's own structured goals.
 *
 * Read from `goals` and not from `text`: `goals` is the authoritative list for
 * the screen (the payload says so in `card_source`), and counting sentences in
 * a composed paragraph would be guessing at our own output.
 */
function weekLine(payload: Record<string, unknown>, language: RunLanguage): string {
  const goals = Array.isArray(payload.goals) ? payload.goals : [];
  const waiting = goals.filter(
    (g) => typeof (g as { pending_question?: unknown }).pending_question === 'string',
  ).length;
  return (WEEK_LINE[language] ?? WEEK_LINE.en)(goals.length, waiting);
}

/**
 * The cost sentence, as it was written into every summary made before the fix.
 *
 * Matched on its own line and by shape rather than by an exact string, because
 * the number differs per person and the wording could gain a space.
 */
const COST_LINE = /^\s*ხარჯი ამ კვირაში:.*$\n?/m;

/**
 * ⚠️ THE FIX TO THE COMPOSER DID NOT REACH ONE SINGLE CARD ALREADY QUEUED —
 * 28 September, and I had written the lesson for this two hours earlier.
 *
 * Row 230 was fixed where the summary is COMPOSED, so every summary from now
 * on carries no cost line and names its authoritative source. Measured
 * immediately afterwards: forty-nine summaries exist, THIRTY of them still
 * unshown, and not one carries `card_source` — every one still has
 * „ხარჯი ამ კვირაში: … ტოკენი" in its text. A summary is made once a week, so
 * the card Ninia is about to open is an old row and would have stayed broken
 * for days while the fix sat in the repository looking done.
 *
 * The comment at the top of this file already says it: computed when read, not
 * when queued, because a field written at queue time leaves every existing row
 * blank. I wrote that about `title`, shipped it, and then fixed the adjacent
 * card the other way within the hour.
 *
 * So the payload is normalised HERE, on the way out. An old row and a new row
 * reach the app identical, and nothing has to be rewritten in the database —
 * which would be a write against thirty real people's rows to correct a
 * sentence.
 */
export function normalisedPayload(
  kind: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (kind !== 'weekly_summary') return payload;
  const text =
    typeof payload.text === 'string' ? payload.text.replace(COST_LINE, '') : payload.text;
  return {
    ...payload,
    ...(typeof text === 'string' && { text }),
    // Old rows never carried it; the answer is the same for both.
    card_source: 'goals',
  };
}

/**
 * What a card shows before it is opened.
 *
 * The goal's own title wins whenever there is one: „Find an architect" tells a
 * person what the card is about and „goal_question" never will. The kind label
 * is the fallback for the cards that belong to no goal — the weekly summary,
 * a thanks, an expired introduction.
 */
export function cardHeading(
  kind: string,
  payload: Record<string, unknown>,
  goalTitle: string | null,
  language: RunLanguage,
): CardHeading {
  const labels = KIND_LABEL[language] ?? KIND_LABEL.en;
  const fallback = labels[kind] ?? text(payload.goal_title) ?? '';
  const goal = text(goalTitle) || text(payload.goal_title);
  /**
   * ⚠️ THE WEEKLY SUMMARY GETS A COUNT, NOT ITS OWN FIRST LINE.
   *
   * Its `text` is the whole report — eight screen-heights on Ninia's phone,
   * and her words were „very stretched, there should be a shorter version".
   * Putting its opening line in the title would repeat the body inside the
   * body's own header and make the card longer, not shorter.
   *
   * What a person wants before tapping is whether it concerns them: how many
   * goals, and how many are waiting on THEM. Two numbers, one line.
   */
  if (kind === 'weekly_summary')
    return { title: labels[kind], detail: weekLine(payload, language) };
  const title = goal !== '' ? goal : fallback !== '' ? fallback : UNTITLED[language];
  return { title: oneLine(title), detail: detailOf(kind, payload, language) };
}
