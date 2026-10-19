import { RunLanguage } from './runLanguage';
import {
  DOCX_CONTENT_TYPE,
  docxFile,
  MARKDOWN_CONTENT_TYPE,
  markdownFile,
} from './messageDocument';
import { getThreadMessages, ThreadMessage } from './threads.service';

/**
 * Board #71 (a loyal old Ally customer, 1 Oct, via Tornike): she uses several
 * assistants, and after explaining her business to one she will not repeat it
 * to another. She asked for „export chat".
 *
 * The conversation as a plain text file, in reading order: who spoke, when,
 * and what was said, with the buttons a message offered. Only what the owner
 * already sees in the chat — the same rows the history route returns, never a
 * step or an engine turn — so nothing leaves that the screen did not show.
 */
const PAGE_SIZE = 200;
/** A ceiling, so one export can never read a thread without bound. */
const MAX_PAGES = 15;
/** Kinds a person reads in the chat that belong in the file; a failure line does not. */
const EXPORTED_KINDS: ReadonlySet<string> = new Set(['message', 'pending']);
const TEXT_EXTENSION = 'txt';

interface ExportWords {
  readonly owner: string;
  readonly assistant: string;
  readonly exported: (date: string) => string;
  readonly buttons: string;
  readonly untitled: string;
}

const WORDS: Readonly<Record<'ka' | 'en', ExportWords>> = {
  ka: {
    owner: 'შენ',
    assistant: 'Netai',
    exported: (date) => `Netai-დან ექსპორტი, ${date} (დრო UTC-ით)`,
    buttons: 'ღილაკები',
    untitled: 'საუბარი',
  },
  en: {
    owner: 'You',
    assistant: 'Netai',
    exported: (date) => `Exported from Netai, ${date} (times in UTC)`,
    buttons: 'Buttons',
    untitled: 'Conversation',
  },
};

export interface ConversationFile {
  readonly filename: string;
  readonly text: string;
}

function wordsFor(language: RunLanguage): ExportWords {
  return language === 'ka' ? WORDS.ka : WORDS.en;
}

/** „2026-10-03 09:30" in UTC, the same in every file whatever the server's zone. */
function minuteOf(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
}

function messageBlock(m: ThreadMessage, words: ExportWords): string {
  const who = m.role === 'user' ? words.owner : words.assistant;
  const lines = [`[${minuteOf(m.created_at)}] ${who}:`, m.content.trim()];
  if (m.choices !== null && m.choices.length > 0) {
    lines.push(`(${words.buttons}: ${m.choices.join(' | ')})`);
  }
  return lines.join('\n');
}

/** A file name a phone and a desktop both accept: letters of any script, digits, dashes. */
export function exportFilename(
  title: string | null,
  threadId: number,
  nowIso: string,
  extension = TEXT_EXTENSION,
): string {
  const base = (title ?? '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const day = nowIso.slice(0, 10);
  return `${base === '' ? `netai-${threadId}` : base}-${day}.${extension}`;
}

function visible(messages: readonly ThreadMessage[]): ThreadMessage[] {
  return messages.filter((m) => EXPORTED_KINDS.has(m.kind) && m.content.trim() !== '');
}

/**
 * #6074, the founder's D842 (19 Oct): „we need export of whole chat, not of
 * each message". The whole conversation, both sides in order with their
 * times, as Markdown — and, through the same text, as Word: the title a
 * heading, who and when in bold, then what was said.
 */
export function conversationMarkdown(
  title: string | null,
  messages: readonly ThreadMessage[],
  language: RunLanguage,
  nowIso: string,
): string {
  const words = wordsFor(language);
  const header = [`# ${title?.trim() || words.untitled}`, words.exported(minuteOf(nowIso))];
  const body = visible(messages).map((m) => {
    const who = m.role === 'user' ? words.owner : words.assistant;
    const lines = [`**[${minuteOf(m.created_at)}] ${who}:**`, m.content.trim()];
    if (m.choices !== null && m.choices.length > 0) {
      lines.push(`(${words.buttons}: ${m.choices.join(' | ')})`);
    }
    return lines.join('\n\n');
  });
  return [...header, ...body].join('\n\n') + '\n';
}

export enum ConversationFormat {
  Markdown = 'md',
  Word = 'docx',
}

export function isConversationFormat(v: unknown): v is ConversationFormat {
  return typeof v === 'string' && (Object.values(ConversationFormat) as string[]).includes(v);
}

export interface ConversationDownload {
  readonly filename: string;
  readonly contentType: string;
  readonly bytes: Buffer;
}

/** The whole conversation as a Markdown or Word file. */
export async function exportConversationFile(
  thread: { readonly id: number; readonly title: string | null },
  language: RunLanguage,
  nowIso: string,
  format: ConversationFormat,
): Promise<ConversationDownload> {
  const markdown = conversationMarkdown(
    thread.title,
    await wholeHistory(thread.id),
    language,
    nowIso,
  );
  const filename = exportFilename(thread.title, thread.id, nowIso, format);
  return format === ConversationFormat.Word
    ? { filename, contentType: DOCX_CONTENT_TYPE, bytes: await docxFile(markdown) }
    : { filename, contentType: MARKDOWN_CONTENT_TYPE, bytes: markdownFile(markdown) };
}

/** The readable text of a conversation's messages, already in reading order. */
export function conversationText(
  title: string | null,
  messages: readonly ThreadMessage[],
  language: RunLanguage,
  nowIso: string,
): string {
  const words = wordsFor(language);
  const header = [title?.trim() || words.untitled, words.exported(minuteOf(nowIso))].join('\n');
  const body = visible(messages).map((m) => messageBlock(m, words));
  return [header, ...body].join('\n\n') + '\n';
}

/** Every page of the thread's visible history, oldest first, up to the ceiling. */
async function wholeHistory(threadId: number): Promise<ThreadMessage[]> {
  const pages: ThreadMessage[][] = [];
  let cursor: ThreadMessage | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await getThreadMessages(threadId, {
      limit: PAGE_SIZE,
      ...(cursor && { beforeCreatedAt: cursor.created_at, beforeId: cursor.id }),
    });
    if (page.length === 0) break;
    pages.unshift(page);
    if (page.length < PAGE_SIZE) break;
    cursor = page[0];
  }
  return pages.flat();
}

export async function exportConversation(
  thread: { readonly id: number; readonly title: string | null },
  language: RunLanguage,
  nowIso: string,
): Promise<ConversationFile> {
  const messages = await wholeHistory(thread.id);
  return {
    filename: exportFilename(thread.title, thread.id, nowIso),
    text: conversationText(thread.title, messages, language, nowIso),
  };
}
