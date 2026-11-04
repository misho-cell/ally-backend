import { saveThreadMessage, userLanguage } from '../threads.service';
import { RunLanguage } from '../runLanguage';
import { mirrorToWhatsapp } from '../whatsappMirror.service';

/**
 * #8911 (the founder, tester 82701): he answered, declined and asked through
 * ChatGPT, the messages reached three real members, and nothing showed in his
 * app — so he did it all again by hand. In the app the owner's own lines are
 * the record; a connector writes none. Each send that went out through the
 * connector now leaves one line in the conversation it belongs to.
 *
 * The line repeats only what the owner wrote themselves, in their own chat.
 */
const MAX_QUOTED_CHARS = 400;

export enum ConnectorAction {
  /** They answered (or turned down) a member's question to them. */
  Answered = 'answered',
  /** A goal's question went to one of their people. */
  Asked = 'asked',
  /** A goal's question was kept, to go when the person's daily limit lets it. */
  AskHeld = 'ask_held',
  /** They said yes to an introduction asked of them. */
  IntroAccepted = 'intro_accepted',
  /** They turned an introduction down. */
  IntroDeclined = 'intro_declined',
}

type TraceLine = (quoted: string, name: string) => string;

const TRACE_LINES: Readonly<Record<ConnectorAction, Readonly<Record<RunLanguage, TraceLine>>>> = {
  [ConnectorAction.Answered]: {
    ka: (q) =>
      `კონექტორიდან (მაგ. ChatGPT ან Claude) ამ კითხვაზე უპასუხე და პასუხი გაიგზავნა: «${q}»`,
    en: (q) =>
      `You answered this question through a connector (e.g. ChatGPT or Claude), and the answer went: «${q}»`,
    ru: (q) =>
      `Ты ответил на этот вопрос через коннектор (например, ChatGPT или Claude), ответ отправлен: «${q}»`,
    es: (q) =>
      `Respondiste a esta pregunta desde un conector (p. ej. ChatGPT o Claude) y la respuesta se envió: «${q}»`,
  },
  [ConnectorAction.Asked]: {
    ka: (q, n) => `კონექტორიდან (მაგ. ChatGPT ან Claude) ${n}-ს ამ მიზანზე ჰკითხე: «${q}»`,
    en: (q, n) =>
      `Through a connector (e.g. ChatGPT or Claude) you asked ${n} about this goal: «${q}»`,
    ru: (q, n) =>
      `Через коннектор (например, ChatGPT или Claude) ты спросил ${n} по этой цели: «${q}»`,
    es: (q, n) =>
      `Desde un conector (p. ej. ChatGPT o Claude) preguntaste a ${n} sobre este objetivo: «${q}»`,
  },
  [ConnectorAction.AskHeld]: {
    ka: (q) =>
      `კონექტორიდან (მაგ. ChatGPT ან Claude) დაწერილი კითხვა შენახულია და მოგვიანებით წავა: «${q}»`,
    en: (q) =>
      `A question written through a connector (e.g. ChatGPT or Claude) is kept and will go later: «${q}»`,
    ru: (q) =>
      `Вопрос, написанный через коннектор (например, ChatGPT или Claude), сохранён и уйдёт позже: «${q}»`,
    es: (q) =>
      `Una pregunta escrita desde un conector (p. ej. ChatGPT o Claude) está guardada y saldrá más tarde: «${q}»`,
  },
  [ConnectorAction.IntroAccepted]: {
    ka: () => 'კონექტორიდან (მაგ. ChatGPT ან Claude) გაცნობის თხოვნას დათანხმდი.',
    en: () => 'Through a connector (e.g. ChatGPT or Claude) you said yes to an introduction.',
    ru: () => 'Через коннектор (например, ChatGPT или Claude) ты согласился на знакомство.',
    es: () => 'Desde un conector (p. ej. ChatGPT o Claude) aceptaste una presentación.',
  },
  [ConnectorAction.IntroDeclined]: {
    ka: () => 'კონექტორიდან (მაგ. ChatGPT ან Claude) გაცნობის თხოვნაზე უარი თქვი.',
    en: () => 'Through a connector (e.g. ChatGPT or Claude) you turned an introduction down.',
    ru: () => 'Через коннектор (например, ChatGPT или Claude) ты отказался от знакомства.',
    es: () => 'Desde un conector (p. ej. ChatGPT o Claude) rechazaste una presentación.',
  },
};

/** The actions whose line carries no words of the owner's. */
const WORDLESS: ReadonlySet<ConnectorAction> = new Set([
  ConnectorAction.IntroAccepted,
  ConnectorAction.IntroDeclined,
]);

/** The owner's words, cut at a word when long. */
export function quotedForTrace(text: string): string {
  const clean = text.trim().replace(/\s+/gu, ' ');
  if (clean.length <= MAX_QUOTED_CHARS) return clean;
  const cut = clean.slice(0, MAX_QUOTED_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}…`;
}

export function traceLine(
  action: ConnectorAction,
  language: RunLanguage,
  text: string,
  name = '',
): string {
  return TRACE_LINES[action][language](quotedForTrace(text), name);
}

/**
 * #8911 (82705): WhatsApp is the founder's main screen, so the same line goes
 * there too, when they chose WhatsApp. Never throws.
 */
async function tellInWhatsappToo(
  userId: string,
  threadId: number | null,
  line: string,
): Promise<void> {
  await mirrorToWhatsapp(
    Number(userId),
    { title: '', body: line, ...(threadId !== null && { url: `/chat/${threadId}` }) },
    false,
  );
}

/**
 * Leaves the line in the owner's conversation (when there is one) and in their
 * WhatsApp. Never fails the send it records: the message already went, and a
 * missing line is logged.
 */
export async function traceInApp(
  userId: string,
  threadId: number | null,
  action: ConnectorAction,
  text: string,
  name = '',
): Promise<void> {
  if (!WORDLESS.has(action) && text.trim() === '') return;
  try {
    const line = traceLine(action, await userLanguage(userId), text, name);
    if (threadId !== null) await saveThreadMessage(threadId, Number(userId), 'assistant', line);
    await tellInWhatsappToo(userId, threadId, line);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[mcp] ${action} not shown in chat ${threadId}:`, (err as Error).message);
  }
}
