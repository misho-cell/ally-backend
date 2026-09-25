import { File as NodeFile } from 'node:buffer';

import { toFile } from 'openai';

import { query } from '../db/postgres/client';
import { recordFixedUsage } from './costLedger.service';
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
        | 'recognizer_failed'
        | 'daily_limit';
      detail?: string;
    };

/**
 * The app team's limits, taken as given: „one sentence fits in this many times
 * over; bigger is probably a forgotten button rather than a sentence."
 */
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
export const MAX_AUDIO_MS = 60_000;

/**
 * ⚠️ A CEILING THE SERVER ENFORCES, BECAUSE THE OTHER ONE IT DOES NOT.
 *
 * The app team said this about their own work, unprompted, and they were
 * right: `duration_ms` is sent BY THE CLIENT. The server does not decode the
 * audio, so the 60-second bound holds only while their code is the only
 * caller and is working. Their words — „if the cost ever rises unexpectedly,
 * suspect this first."
 *
 * That leaves 5 MB per call as the only real guard, and 5 MB times a rate
 * limit is not a number anybody can put in front of Misho. He is being asked
 * to approve a spend; he should be able to be told its MAXIMUM, and a maximum
 * that depends on somebody else's code being correct is not one.
 *
 * So: a per-account daily ceiling, counted from the ledger the spend is
 * written to. Twenty minutes of audio a day is far more than a person
 * dictating sentences into a chat, and it makes the worst case a sentence
 * instead of a hope.
 */
export const MAX_SECONDS_PER_DAY = 20 * 60;
/** Whisper is billed by audio minute; this is the key the ledger prices it by. */
const PRICE_KEY = 'openai.whisper.minute';
const LEDGER_TIMEOUT_MS = 4_000;

/**
 * How much audio this account has had transcribed today, from `usage_events` —
 * the same ledger the cost is written to, so the guard and the bill can never
 * disagree about what happened.
 */
export async function secondsUsedToday(userId: string): Promise<number> {
  const result = await query<{ seconds: string | null }>(
    `SELECT COALESCE(SUM(units), 0) * 60 AS seconds
       FROM usage_events
      WHERE user_id = $1 AND kind = 'speech'
        AND created_at >= DATE_TRUNC('day', NOW())`,
    [userId],
    LEDGER_TIMEOUT_MS,
  );
  return Number(result.rows[0]?.seconds ?? 0);
}

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

/**
 * ⚠️ „LANGUAGE 'ka' IS NOT SUPPORTED" — the API's own words, 21:50:40 UTC.
 *
 * The tester sent the same clip twice: without `language` it came back with
 * text, with `language=ka` it was a 400 every time. The recogniser TRANSCRIBES
 * Georgian perfectly well; what it will not take is Georgian as the value of
 * that parameter. Two different things behind one word, which is why the log
 * had to be read rather than reasoned about — „Whisper knows Georgian" is true
 * and was not the question.
 *
 * ⚠️ AND I AM NOT HARDCODING THE LIST IT DOES TAKE, because I do not know it
 * and a guess here is a 400 on somebody's voice. The refusal names the
 * language, so the refusal is the list: send the hint, and if it comes back
 * refused, remember that and never send it again. The first Georgian call this
 * process serves pays for one retry; no call after it does.
 *
 * It is per-process and deliberately not persisted: it is a cache of something
 * the API is free to change, and a restart asking once more is the correct
 * behaviour on the day Georgian becomes supported.
 */
const languagesTheRecogniserRefused = new Set<string>();

function refusedTheLanguage(message: string): boolean {
  return /language\s+'[^']*'\s+is not supported/i.test(message);
}

/**
 * „ka-GE" and „KA" are the same hint. Region and case are the caller's to vary
 * and neither changes which language was spoken.
 */
export function languageHint(raw: string | undefined): string | undefined {
  const code = (raw ?? '').trim().toLowerCase().split(/[-_]/)[0];
  return code === '' ? undefined : code;
}

/**
 * WHAT REPLACES THE HINT WHEN THE HINT IS REFUSED.
 *
 * Without any steer the recogniser auto-detects, and on the tester's synthetic
 * clip it detected JAPANESE. Their sentence, and it is the right standard:
 * „Georgian must not depend on a guess."
 *
 * A `prompt` is the recogniser's own supported way to bias an transcription —
 * it is read as preceding context, so a line of Georgian script makes Georgian
 * script the obvious continuation. It is NOT a command and it is not put in
 * front of the user's words; it never appears in the result.
 *
 * One short, ordinary sentence per language the product speaks. Nothing
 * task-specific: a prompt naming plumbers would bias the words as well as the
 * script, and the user is the one who decides what they said.
 */
const SCRIPT_PRIMER: Record<string, string> = {
  ka: 'გამარჯობა. ეს არის ჩვეულებრივი ქართული წინადადება.',
  ru: 'Здравствуйте. Это обычное предложение на русском языке.',
  es: 'Hola. Esta es una frase normal en español.',
  en: 'Hello. This is an ordinary sentence in English.',
};

export function baseType(mime: string): string {
  return (mime ?? '').split(';')[0].trim().toLowerCase();
}

/**
 * ⚠️ WHAT THE FIRST REAL CALL RETURNED, AND IT WAS NEITHER OF THE TWO THINGS
 * I HAD PREDICTED.
 *
 * I told the tester and the app team that one attempt would settle it, and
 * named the three answers it could give: Georgian text (done), „not switched
 * on" (the key is missing), or no permission dialog (their diagnosis was
 * wrong). The tester ran it from their own seat at 21:23 UTC on 25 September —
 * 172101, a three-second Georgian clip, twice, webm and mp3 — and got a fourth
 * answer I had not listed:
 *
 *   „`File` is not defined as a global, which is required for file uploads."
 *
 * `File` became a Node global in version 20. This service runs on older, so
 * `toFile` — the SDK's OWN supported way to send a Buffer, which is why it was
 * used — builds a `File` that does not exist there. It typechecks. It passes
 * every test that does not make a real upload. It fails on the first paid call.
 *
 * MY OWN DISTINCTION, APPLIED TO A THIRD THING I HAD NOT LISTED. „The flag is
 * set" and „transcription works" are different facts and I said so at length.
 * „The key is present" and „the runtime can send a file" are also different
 * facts, and I did not think to separate them — so the one attempt I asked for
 * proved something I was not even asking about, which is the best argument
 * there is for asking for it.
 *
 * `node:buffer` has carried `File` since 18.13, so the class is there; only the
 * global binding is missing. This is a no-op on any runtime that already has
 * it, including the one the tests run on.
 */
export function ensureFileGlobal(): void {
  const scope = globalThis as { File?: unknown };
  if (typeof scope.File === 'undefined') {
    scope.File = NodeFile;
  }
}

export function transcriptionIsOn(): boolean {
  return process.env.SPEECH_TO_TEXT_ENABLED?.trim() === 'true';
}

export interface TranscribeInput {
  /** Whose ceiling and whose bill. */
  readonly userId: string;
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

/** What the recogniser gives back, narrowed to the two fields this service reads. */
interface Heard {
  readonly text?: string;
  readonly language?: string;
}

/**
 * One transcription, with the language hint if the recogniser will take it and
 * a script primer if it will not.
 *
 * The retry happens ONCE and only on the named refusal. Any other failure is
 * the caller's to report — retrying a timeout or a rate limit here would spend
 * somebody's money twice on the same second of audio.
 */
async function transcribeWith(
  client: NonNullable<ReturnType<typeof openaiClient>>,
  file: Awaited<ReturnType<typeof toFile>>,
  hint: string | undefined,
): Promise<Heard> {
  const primer = hint === undefined ? undefined : SCRIPT_PRIMER[hint];
  const sendHint = hint !== undefined && !languagesTheRecogniserRefused.has(hint);
  const ask = (withHint: boolean): Promise<Heard> =>
    client.audio.transcriptions.create({
      file,
      model: MODEL,
      // The detected language comes back only in the verbose form, and it is
      // the whole point of asking.
      response_format: 'verbose_json',
      ...(withHint && hint !== undefined ? { language: hint } : {}),
      // Carried whether or not the hint is: it costs nothing and it is what
      // keeps Georgian in Georgian script when no hint is allowed.
      ...(primer === undefined ? {} : { prompt: primer }),
    }) as unknown as Promise<Heard>;

  if (!sendHint) return ask(false);
  try {
    return await ask(true);
  } catch (error) {
    const message = (error as Error).message ?? '';
    if (!refusedTheLanguage(message) || hint === undefined) throw error;
    languagesTheRecogniserRefused.add(hint);
    // eslint-disable-next-line no-console
    console.warn(
      `[speech] the recogniser will not take language=${hint} ("${message.slice(0, 120)}") — ` +
        'retrying without it, and not sending it again',
    );
    return ask(false);
  }
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
  /**
   * Checked before a byte is sent, and it uses the client's own duration when
   * it has one. With no duration the call still counts — at a minimum charge —
   * because a caller that stops sending `duration_ms` must not thereby become
   * free.
   */
  const seconds = Math.max(1, Math.round((input.durationMs ?? MAX_AUDIO_MS) / 1000));
  const alreadyUsed = await secondsUsedToday(input.userId).catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[speech] could not read today usage:', (error as Error).message);
    // Could not look is not „nothing used". Refusing is the safe direction
    // when the thing being guarded is somebody else's money.
    return Number.POSITIVE_INFINITY;
  });
  if (alreadyUsed + seconds > MAX_SECONDS_PER_DAY) {
    return { ok: false, reason: 'daily_limit' };
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
    // Before the upload and not at import time: a module that mutates a global
    // the moment it is required is a module that changes what every other test
    // in the process sees.
    ensureFileGlobal();
    const file = await toFile(input.audio, `speech.${EXTENSION[type] ?? 'mp4'}`, { type });
    const result = await transcribeWith(client, file, languageHint(input.language));
    // Written to the ledger before the answer is returned, so the spend is
    // recorded whatever the caller then does with the text.
    await recordFixedUsage({
      userId: input.userId,
      kind: 'speech',
      provider: 'openai',
      priceKey: PRICE_KEY,
      units: seconds / 60,
      label: MODEL,
    }).catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[speech] could not record the spend:', (error as Error).message);
    });
    const text = (result.text ?? '').trim();
    if (text === '') {
      // „I listened and heard no words" is not „I could not listen". The app
      // team asked for these to be separable and they were right to.
      return { ok: false, reason: 'no_speech' };
    }
    /**
     * WHAT IT HEARD, not what it was told. This used to echo the caller's own
     * hint straight back, so the field answered „ka" to the question „was this
     * Georgian?" purely because the phone had said so — and on the one clip
     * where it mattered the recogniser had decided Japanese. A field that
     * cannot disagree with its input is not an answer.
     */
    return { ok: true, text, language: result.language ?? languageHint(input.language) ?? null };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[speech] transcription failed:', (error as Error).message);
    return { ok: false, reason: 'recognizer_failed' };
  }
}
