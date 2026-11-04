import { GRAPH_URL } from './whatsappChannel.service';
import { TranscriptionOutcome, transcribe } from './speech.service';

/**
 * Misho, 4 Nov („კი, გააკეთე შენი რეკომენდაციებით"): a member may speak to
 * Netai in WhatsApp. A voice note (OGG/Opus) is fetched from Meta, turned into
 * text by the same recogniser the app uses, and posted as if typed. The member
 * first reads what was heard, so a misheard Georgian word is caught at once.
 * Up to 3 minutes a note; off until WHATSAPP_VOICE_ON is „true".
 */
export const WHATSAPP_VOICE_MAX_MS = 180_000;
const MEDIA_TIMEOUT_MS = 15_000;
/** The longest piece of what was heard that is read back. */
const HEARD_SHOWN_CHARS = 300;
const OGG_PAGE = 'OggS';
const OPUS_HEAD = 'OpusHead';
/** Opus granule positions count 48 kHz samples. */
const OPUS_SAMPLES_PER_MS = 48;
const GRANULE_OFFSET = 6;
const PRE_SKIP_OFFSET = 10;

export const VOICE_LINES = {
  off: 'ხმოვან შეტყობინებებს ჯერ ვერ ვკითხულობ — დამიწერე, გთხოვ.',
  notHeard: 'ხმოვანი ვერ გავიგე — სცადე ხელახლა, ან დამიწერე.',
  tooLong: 'ხმოვანი 3 წუთზე გრძელია — მოკლედ გაიმეორე, ან დამიწერე.',
  dailyLimit: 'დღეს ხმოვნების ლიმიტი ამოიწურა — დამიწერე, გთხოვ.',
} as const;

export function whatsappVoiceOn(): boolean {
  return process.env.WHATSAPP_VOICE_ON?.trim() === 'true';
}

/**
 * The clip's length from its last Ogg page, in ms; null when it cannot be read.
 * Meta sends no duration, and the limit and the bill both need one.
 */
export function oggDurationMs(audio: Buffer): number | null {
  const last = audio.lastIndexOf(OGG_PAGE);
  if (last === -1 || last + GRANULE_OFFSET + 8 > audio.length) return null;
  const granule = audio.readBigInt64LE(last + GRANULE_OFFSET);
  if (granule <= 0n) return null;
  const head = audio.indexOf(OPUS_HEAD);
  const preSkip =
    head !== -1 && head + PRE_SKIP_OFFSET + 2 <= audio.length
      ? audio.readUInt16LE(head + PRE_SKIP_OFFSET)
      : 0;
  return Math.max(0, Math.round((Number(granule) - preSkip) / OPUS_SAMPLES_PER_MS));
}

/** What the member reads first: the words heard, cut at a word. */
export function heardLine(text: string): string {
  const flat = text.replace(/\s+/gu, ' ').trim();
  if (flat.length <= HEARD_SHOWN_CHARS) return `🎤 გავიგე: „${flat}"`;
  const cut = flat.slice(0, HEARD_SHOWN_CHARS);
  const atWord = cut.lastIndexOf(' ');
  return `🎤 გავიგე: „${(atWord > 0 ? cut.slice(0, atWord) : cut).trimEnd()}…"`;
}

/** The line a failed transcription is answered with. */
export function lineForRefusal(outcome: TranscriptionOutcome): string {
  if (outcome.ok) return VOICE_LINES.notHeard;
  if (outcome.reason === 'not_enabled') return VOICE_LINES.off;
  if (outcome.reason === 'too_long' || outcome.reason === 'too_large') return VOICE_LINES.tooLong;
  if (outcome.reason === 'daily_limit') return VOICE_LINES.dailyLimit;
  return VOICE_LINES.notHeard;
}

interface MediaAnswer {
  readonly url?: string;
  readonly mime_type?: string;
}

function graphToken(): string {
  const value = process.env.WHATSAPP_TOKEN?.trim();
  if (!value) throw new Error('WHATSAPP_TOKEN is not set');
  return value;
}

/** The voice note's bytes and type, from Meta: its address first, then the file itself. */
export async function downloadWhatsappMedia(
  mediaId: string,
): Promise<{ readonly audio: Buffer; readonly mime: string }> {
  const headers = { Authorization: `Bearer ${graphToken()}` };
  const meta = await fetch(`${GRAPH_URL}/${encodeURIComponent(mediaId)}`, {
    headers,
    signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS),
  });
  if (!meta.ok) throw new Error(`WhatsApp media ${meta.status}: the address was not given`);
  const answer = (await meta.json()) as MediaAnswer;
  if (typeof answer.url !== 'string') throw new Error('WhatsApp media: no address in the answer');
  const file = await fetch(answer.url, { headers, signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS) });
  if (!file.ok) throw new Error(`WhatsApp media ${file.status}: the file was not given`);
  return {
    audio: Buffer.from(await file.arrayBuffer()),
    mime: answer.mime_type ?? 'audio/ogg',
  };
}

/** A voice note in text, or the line to answer with instead. */
export async function voiceNoteText(
  userId: number,
  mediaId: string,
): Promise<{ readonly text: string } | { readonly refusal: string }> {
  if (!whatsappVoiceOn()) return { refusal: VOICE_LINES.off };
  try {
    const { audio, mime } = await downloadWhatsappMedia(mediaId);
    const outcome = await transcribe({
      userId: String(userId),
      audio,
      mime,
      language: 'ka',
      durationMs: oggDurationMs(audio) ?? undefined,
      maxMs: WHATSAPP_VOICE_MAX_MS,
    });
    return outcome.ok ? { text: outcome.text } : { refusal: lineForRefusal(outcome) };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[whatsapp] voice note not read:', (err as Error).message);
    return { refusal: VOICE_LINES.notHeard };
  }
}
