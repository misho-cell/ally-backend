import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('../../config/openai', () => ({ __esModule: true, openaiClient: jest.fn() }));

import { openaiClient } from '../../config/openai';
import { transcribe, baseType, transcriptionIsOn, MAX_AUDIO_BYTES } from '../speech.service';

const mockClient = openaiClient as jest.MockedFunction<typeof openaiClient>;

/**
 * ROW 226 — GEORGIAN VOICE ON AN IPHONE, the backend half.
 *
 * The cause, confirmed by the app team and not guessed at: iOS
 * `SpeechRecognition` uses Apple's dictation, WHICH HAS NO GEORGIAN. Asking it
 * for ka-GE is ignored and it answers in English — Salome spoke Georgian and
 * got „Dermatology Archive archive". Android only works because Chrome ships
 * the audio to Google. So the product has never had Georgian voice on an
 * iPhone in any build; it is not a regression, and no client fix reaches it.
 *
 * ⚠️ THE WHOLE POINT OF THIS FILE IS THE REFUSALS. The app team asked for
 * them by name, and their reason is the same one this codebase keeps
 * relearning: „an empty text and a 200 is the same trap catch {} was — „I
 * heard nothing" and „I could not try" are not the same thing, and I have to
 * tell a person different things."
 */
const audio = (bytes = 1024): Buffer => Buffer.alloc(bytes, 1);

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.SPEECH_TO_TEXT_ENABLED;
});

describe('it is off until somebody with the authority turns it on', () => {
  /**
   * Transcription costs money per minute. Spend is Misho's or the founder's
   * word and never mine, so the default is off and the answer says which.
   */
  it('refuses with not_enabled by default, without calling anybody', async () => {
    const out = await transcribe({ audio: audio(), mime: 'audio/mp4' });

    expect(out).toEqual({ ok: false, reason: 'not_enabled' });
    expect(mockClient).not.toHaveBeenCalled();
  });

  it('is only on for the exact string true', async () => {
    process.env.SPEECH_TO_TEXT_ENABLED = 'TRUE';
    expect(transcriptionIsOn()).toBe(false);

    process.env.SPEECH_TO_TEXT_ENABLED = '1';
    expect(transcriptionIsOn()).toBe(false);

    process.env.SPEECH_TO_TEXT_ENABLED = 'true';
    expect(transcriptionIsOn()).toBe(true);
  });

  /**
   * The flag on and the key missing is somebody's mistake, not the caller's.
   * It must not reach the phone as „we could not understand you".
   */
  it('says not_enabled, not recognizer_failed, when the key is absent', async () => {
    process.env.SPEECH_TO_TEXT_ENABLED = 'true';
    mockClient.mockReturnValue(null);

    const out = await transcribe({ audio: audio(), mime: 'audio/mp4' });

    expect(out).toEqual({ ok: false, reason: 'not_enabled' });
  });
});

describe('every refusal has its own name', () => {
  beforeEach(() => {
    process.env.SPEECH_TO_TEXT_ENABLED = 'true';
    mockClient.mockReturnValue(null);
  });

  it('too_large is checked before anything is sent', async () => {
    const out = await transcribe({ audio: audio(MAX_AUDIO_BYTES + 1), mime: 'audio/mp4' });

    expect(out).toEqual({ ok: false, reason: 'too_large' });
    expect(mockClient).not.toHaveBeenCalled();
  });

  /**
   * The server does NOT decode the audio to measure it, so this bound applies
   * only when the client sends its own measurement. That is said out loud in
   * the service and here, because a limit that silently does not apply is
   * worse than no limit — somebody builds on it.
   */
  it('too_long only when the client actually said how long it was', async () => {
    const tooLong = await transcribe({ audio: audio(), mime: 'audio/mp4', durationMs: 90_000 });
    expect(tooLong).toEqual({ ok: false, reason: 'too_long' });

    const unsaid = await transcribe({ audio: audio(), mime: 'audio/mp4' });
    expect(unsaid).not.toEqual({ ok: false, reason: 'too_long' });
  });

  it('unsupported_format names the type it was given', async () => {
    const out = await transcribe({ audio: audio(), mime: 'video/mp4' });

    expect(out).toEqual({ ok: false, reason: 'unsupported_format', detail: 'video/mp4' });
  });
});

describe('the three types the browsers really produce', () => {
  /**
   * Taken from the app team, who asked me to trust the mimeType MediaRecorder
   * gave them over any file extension: iOS Safari `audio/mp4`, Android Chrome
   * `audio/webm;codecs=opus`, some desktops `audio/ogg`.
   */
  it('accepts a codec parameter on the type', () => {
    expect(baseType('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(baseType('AUDIO/MP4 ')).toBe('audio/mp4');
  });

  it.each(['audio/mp4', 'audio/webm;codecs=opus', 'audio/ogg'])('takes %s', async (mime) => {
    process.env.SPEECH_TO_TEXT_ENABLED = 'true';
    mockClient.mockReturnValue(null);

    const out = await transcribe({ audio: audio(), mime });

    // Reaches the client (which is absent here) rather than being turned away
    // at the format door.
    expect(out).not.toMatchObject({ reason: 'unsupported_format' });
  });
});

describe('heard nothing is not could not try', () => {
  const withRecogniser = (impl: () => Promise<{ text: string }>): void => {
    process.env.SPEECH_TO_TEXT_ENABLED = 'true';
    mockClient.mockReturnValue({
      audio: { transcriptions: { create: impl } },
    } as never);
  };

  it('returns the words when there are words', async () => {
    withRecogniser(async () => ({ text: '  გამარჯობა, ერთი კითხვა მაქვს  ' }));

    const out = await transcribe({ audio: audio(), mime: 'audio/mp4', language: 'ka' });

    expect(out).toEqual({ ok: true, text: 'გამარჯობა, ერთი კითხვა მაქვს', language: 'ka' });
  });

  it('calls empty speech no_speech and a thrown recogniser recognizer_failed', async () => {
    withRecogniser(async () => ({ text: '   ' }));
    expect(await transcribe({ audio: audio(), mime: 'audio/mp4' })).toEqual({
      ok: false,
      reason: 'no_speech',
    });

    withRecogniser(async () => {
      throw new Error('upstream exploded');
    });
    expect(await transcribe({ audio: audio(), mime: 'audio/mp4' })).toEqual({
      ok: false,
      reason: 'recognizer_failed',
    });
  });

  /** A wrong language hint is the very bug being fixed, so none is sent unasked. */
  it('does not invent a language hint', async () => {
    const create = jest.fn(async () => ({ text: 'hello' }));
    withRecogniser(create as never);

    await transcribe({ audio: audio(), mime: 'audio/mp4' });

    expect(create.mock.calls[0][0]).not.toHaveProperty('language');
  });
});

/**
 * The route's own promises, which live in its file rather than in this one.
 */
describe('what the route promises the phone', () => {
  const route = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'speech.routes.ts'),
    'utf8',
  );

  it('never writes the audio to disk', () => {
    expect(route).toContain('multer.memoryStorage()');
    expect(route).not.toContain('diskStorage');
  });

  /** A voice note in a log is the same mistake as a phone number in one. */
  it('never logs what was said', () => {
    expect(route).toContain('outcome.text.length');
    expect(route).not.toMatch(/console\.log\([^)]*outcome\.text[^.]/);
  });

  it('turns an oversized body into a named refusal, not a 500', () => {
    expect(route).toContain('LIMIT_FILE_SIZE');
    expect(route).toContain("error: tooBig ? 'too_large' : 'bad_upload'");
  });

  it('gives each refusal its own status', () => {
    for (const reason of [
      'not_enabled',
      'too_long',
      'too_large',
      'unsupported_format',
      'no_speech',
      'recognizer_failed',
    ]) {
      expect(route).toContain(reason);
    }
  });

  it('is behind the login and a tighter rate limit than usual', () => {
    expect(route).toContain('speechRouter.use(authenticateJwt, requireUserRole)');
    expect(route).toContain('rateLimit({ windowMs: 60_000, max: 20 })');
  });
});
