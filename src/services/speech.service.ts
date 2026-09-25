import { toFile } from 'openai';

import { openaiClient } from '../config/openai';

/**
 * SPEECH TO TEXT, for row 226 — Georgian voice on an iPhone.
 *
 * WHY THIS EXISTS AT ALL, because it is not obvious from here: iOS
 * `SpeechRecognition` uses Apple's own dictation, WHICH HAS NO GEORGIAN.
 * Asking it for `ka-GE` is ignored and it falls back to English — Salome spoke
 * Georgian and the box wrote „Dermatology Archive archive". Android works only
 * because Chrome ships the audio to Google's recogniser, which knows Georgian.
 * So the product has NEVER had Georgian voice on an iPhone, in any build. It
 * is not a regression and no client-side fix can reach it.
 *
 * The app team's second finding is why this is one job and not two: in the
 * Home-Screen app iOS refuses web speech outright (`service-not-allowed`), and
 * the microphone permission never even gets asked, because `SpeechRecognition`
 * does not go through `getUserMedia` there. Recording the audio ourselves DOES
 * go through `getUserMedia`, which asks properly and works in that context. So
 * the dead button and the missing Georgian die together.
 *
 * ⚠️ NO NEW PROVIDER AND NO NEW ACCOUNT. This uses the OpenAI client the
 * product already has, the one behind `config/openai.ts` that returns null
 * when no key is set. Nothing was signed up for and nothing was enabled.
 *
 * ⚠️ AND IT IS OFF UNTIL SOMEBODY SAYS OTHERWISE. Transcription costs money
 * per minute of audio. That is a spend, and spend is Misho's or the founder's
 * word, never mine — so the flag defaults to off and the route answers
 * `not_enabled` until it is turned on. The whole path can be built and tested
 * against that answer without a single paid call.
 */

/** What the caller gets back, named so „I heard nothing" and „I could not try" never merge. */
export type TranscriptionOutcome =
  | { ok: true; text: string; language: string | null }
  | {
      ok: false;
      reason:
        | 'not_enabled'
        | 'too_long'
        | 'too_large'
        | 'unsupported_format'
        | 'no_speech'
        | 'recognizer_failed';
      detail?: string;
    };

/**
 * The app team's limits, taken as given: „one sentence fits in this many times
 * over; bigger is probably a forgotten button rather than a sentence."
 */
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
export const MAX_AUDIO_MS = 60_000;

/**
 * The three the browsers actually produce, which the app team listed and asked
 * me to trust over the file extension: iOS Safari gives `audio/mp4` (AAC),
 * Android Chrome `audio/webm;codecs=opus`, some desktops `audio/ogg`. Matched
 * on the type before the `;`, because the codec parameter is theirs to vary.
 */
const ACCEPTED_TYPES = new Set([
  'audio/mp4',
  'audio/m4a',
  'audio/aac',
  'audio/webm',
  'audio/ogg',
  'audio/wav',
  'audio/mpeg',
]);

/** A filename is required by the API and the extension is how it reads the container. */
const EXTENSION: Record<string, string> = {
  'audio/mp4': 'mp4',
  'audio/m4a': 'm4a',
  'audio/aac': 'm4a',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/mpeg': 'mp3',
};

/** Whisper knows Georgian; this is the hint, and the answer says what it actually heard. */
const MODEL = 'whisper-1';

export function baseType(mime: string): string {
  return (mime ?? '').split(';')[0].trim().toLowerCase();
}

export function transcriptionIsOn(): boolean {
  return process.env.SPEECH_TO_TEXT_ENABLED?.trim() === 'true';
}

export interface TranscribeInput {
  readonly audio: Buffer;
  readonly mime: string;
  /** The caller's best guess at the language. A hint, never a command. */
  readonly language?: string;
  /**
   * The client's own measurement. The server does NOT decode the audio to find
   * out, so this is enforced only when it is sent — said plainly rather than
   * implied, because a limit that silently does not apply is worse than none.
   */
  readonly durationMs?: number;
}

export async function transcribe(input: TranscribeInput): Promise<TranscriptionOutcome> {
  if (!transcriptionIsOn()) {
    return { ok: false, reason: 'not_enabled' };
  }
  if (input.audio.byteLength > MAX_AUDIO_BYTES) {
    return { ok: false, reason: 'too_large' };
  }
  if (input.durationMs !== undefined && input.durationMs > MAX_AUDIO_MS) {
    return { ok: false, reason: 'too_long' };
  }
  const type = baseType(input.mime);
  if (!ACCEPTED_TYPES.has(type)) {
    return { ok: false, reason: 'unsupported_format', detail: type };
  }
  const client = openaiClient();
  if (client === null) {
    // The flag is on and the key is not, which is somebody's mistake and not a
    // thing the caller did. Worth a line; never a 500 to the phone.
    // eslint-disable-next-line no-console
    console.error('[speech] SPEECH_TO_TEXT_ENABLED is true but no OPENAI_API_KEY is set');
    return { ok: false, reason: 'not_enabled' };
  }

  try {
    const file = await toFile(input.audio, `speech.${EXTENSION[type] ?? 'mp4'}`, { type });
    const result = await client.audio.transcriptions.create({
      file,
      model: MODEL,
      // Omitted rather than guessed: Whisper detects the language itself, and a
      // wrong hint is worse than none — this is exactly the failure being
      // fixed, an engine told „ka-GE" and answering in English anyway.
      ...(input.language ? { language: input.language } : {}),
    });
    const text = (result.text ?? '').trim();
    if (text === '') {
      // „I listened and heard no words" is not „I could not listen". The app
      // team asked for these to be separable and they were right to.
      return { ok: false, reason: 'no_speech' };
    }
    return { ok: true, text, language: input.language ?? null };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[speech] transcription failed:', (error as Error).message);
    return { ok: false, reason: 'recognizer_failed' };
  }
}
