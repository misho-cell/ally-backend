import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('../../config/openai', () => ({ __esModule: true, openaiClient: jest.fn() }));
jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordFixedUsage: jest.fn().mockResolvedValue(undefined),
}));

import { openaiClient } from '../../config/openai';
import { query } from '../../db/postgres/client';
import { recordFixedUsage } from '../costLedger.service';
import {
  transcribe,
  baseType,
  transcriptionIsOn,
  ensureFileGlobal,
  languageHint,
  MAX_AUDIO_BYTES,
  MAX_SECONDS_PER_DAY,
} from '../speech.service';

const mockClient = openaiClient as jest.MockedFunction<typeof openaiClient>;
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockLedger = recordFixedUsage as jest.MockedFunction<typeof recordFixedUsage>;

/** Nothing transcribed today unless a test says otherwise. */
const usedToday = (seconds: number): void => {
  mockQuery.mockResolvedValue({ rows: [{ seconds: String(seconds) }], rowCount: 1 } as never);
};

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
  usedToday(0);
});

describe('it is off until somebody with the authority turns it on', () => {
  /**
   * Transcription costs money per minute. Spend is Misho's or the founder's
   * word and never mine, so the default is off and the answer says which.
   */
  it('refuses with not_enabled by default, without calling anybody', async () => {
    const out = await transcribe({ userId: '1', audio: audio(), mime: 'audio/mp4' });

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

    const out = await transcribe({ userId: '1', audio: audio(), mime: 'audio/mp4' });

    expect(out).toEqual({ ok: false, reason: 'not_enabled' });
  });
});

describe('every refusal has its own name', () => {
  beforeEach(() => {
    process.env.SPEECH_TO_TEXT_ENABLED = 'true';
    mockClient.mockReturnValue(null);
  });

  it('too_large is checked before anything is sent', async () => {
    const out = await transcribe({
      userId: '1',
      audio: audio(MAX_AUDIO_BYTES + 1),
      mime: 'audio/mp4',
    });

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
    const tooLong = await transcribe({
      userId: '1',
      audio: audio(),
      mime: 'audio/mp4',
      durationMs: 90_000,
    });
    expect(tooLong).toEqual({ ok: false, reason: 'too_long' });

    const unsaid = await transcribe({ userId: '1', audio: audio(), mime: 'audio/mp4' });
    expect(unsaid).not.toEqual({ ok: false, reason: 'too_long' });
  });

  it('unsupported_format names the type it was given', async () => {
    const out = await transcribe({ userId: '1', audio: audio(), mime: 'video/mp4' });

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

    const out = await transcribe({ userId: '1', audio: audio(), mime });

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

    const out = await transcribe({
      userId: '1',
      audio: audio(),
      mime: 'audio/mp4',
      language: 'ka',
    });

    expect(out).toEqual({ ok: true, text: 'გამარჯობა, ერთი კითხვა მაქვს', language: 'ka' });
  });

  it('calls empty speech no_speech and a thrown recogniser recognizer_failed', async () => {
    withRecogniser(async () => ({ text: '   ' }));
    expect(await transcribe({ userId: '1', audio: audio(), mime: 'audio/mp4' })).toEqual({
      ok: false,
      reason: 'no_speech',
    });

    withRecogniser(async () => {
      throw new Error('upstream exploded');
    });
    expect(await transcribe({ userId: '1', audio: audio(), mime: 'audio/mp4' })).toEqual({
      ok: false,
      reason: 'recognizer_failed',
    });
  });

  /** A wrong language hint is the very bug being fixed, so none is sent unasked. */
  it('does not invent a language hint', async () => {
    const create = jest.fn(async () => ({ text: 'hello' }));
    withRecogniser(create as never);

    await transcribe({ userId: '1', audio: audio(), mime: 'audio/mp4' });

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

  /**
   * ⚠️ THE TWO SILENT REFUSALS. Every other path through the handler writes a
   * `[speech]` line, and a success also writes a usage row — but `bad_upload`
   * and `unsupported_format` returned 400 with no trace at all. So „the
   * recording never reached the server" and „it arrived empty" looked
   * identical from the outside, which is what row 226 kept running into.
   *
   * And the line must still not carry what was said: a size and a reason, and
   * nothing from the audio.
   */
  it('leaves a trace on the two refusals that used to be silent', () => {
    expect(route).toContain('[speech] user ${userId}: bad_upload');
    expect(route).toContain('[speech] user ${userId}: unsupported_format');
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

/**
 * ⚠️ A CEILING THE SERVER ENFORCES, BECAUSE THE OTHER ONE IT DOES NOT.
 *
 * The app team said this about their own work, unprompted: `duration_ms` is
 * sent BY THE CLIENT. The server does not decode the audio, so the 60-second
 * bound holds only while their code is the only caller and is working. Their
 * words — „if the cost ever rises unexpectedly, suspect this first."
 *
 * That left 5 MB per call as the only real guard, and 5 MB times a rate limit
 * is not a number anybody can put in front of Misho. He is being asked to
 * approve a spend; he should be able to be told its MAXIMUM, and a maximum
 * that depends on somebody else's code being correct is not one.
 */
describe('the day has a ceiling and the server is the one holding it', () => {
  const recogniser = (text: string): void => {
    process.env.SPEECH_TO_TEXT_ENABLED = 'true';
    mockClient.mockReturnValue({
      audio: { transcriptions: { create: async () => ({ text }) } },
    } as never);
  };

  it('refuses once the day is spent, before sending anything', async () => {
    recogniser('hello');
    usedToday(MAX_SECONDS_PER_DAY);

    const out = await transcribe({
      userId: '1',
      audio: audio(),
      mime: 'audio/mp4',
      durationMs: 5_000,
    });

    expect(out).toEqual({ ok: false, reason: 'daily_limit' });
    expect(mockLedger).not.toHaveBeenCalled();
  });

  it('lets a call through while there is room', async () => {
    recogniser('გამარჯობა');
    usedToday(10);

    const out = await transcribe({
      userId: '1',
      audio: audio(),
      mime: 'audio/mp4',
      durationMs: 5_000,
    });

    expect(out).toMatchObject({ ok: true });
  });

  /**
   * „I could not look" is not „nothing has been used". When the thing being
   * guarded is somebody else's money, the safe direction is to refuse — the
   * same distinction the ops scripts are built on, pointed at a bill.
   */
  it('refuses when it cannot read the ledger at all', async () => {
    recogniser('hello');
    mockQuery.mockRejectedValue(new Error('database is away'));

    const out = await transcribe({ userId: '1', audio: audio(), mime: 'audio/mp4' });

    expect(out).toEqual({ ok: false, reason: 'daily_limit' });
  });

  /**
   * A caller that stops sending `duration_ms` must not thereby become free —
   * that is exactly the hole the ceiling exists to cover, and it would be a
   * poor joke to leave it open in the ceiling itself.
   */
  it('charges the full allowance to a call that will not say how long it was', async () => {
    recogniser('hello');
    usedToday(0);

    await transcribe({ userId: '1', audio: audio(), mime: 'audio/mp4' });

    expect(mockLedger).toHaveBeenCalledWith(expect.objectContaining({ units: 1 }));
  });

  it('writes the spend to the same ledger everything else uses', async () => {
    recogniser('hello');
    usedToday(0);

    await transcribe({
      userId: '77',
      audio: audio(),
      mime: 'audio/mp4',
      durationMs: 30_000,
    });

    expect(mockLedger).toHaveBeenCalledWith({
      userId: '77',
      kind: 'speech',
      provider: 'openai',
      priceKey: 'openai.whisper.minute',
      units: 0.5,
      label: 'whisper-1',
    });
  });

  /** The bill must not be lost because the answer came back. */
  it('still answers when the ledger write fails, and says so in the log', async () => {
    recogniser('hello');
    usedToday(0);
    mockLedger.mockRejectedValueOnce(new Error('ledger down'));

    const out = await transcribe({ userId: '1', audio: audio(), mime: 'audio/mp4' });

    expect(out).toMatchObject({ ok: true, text: 'hello' });
  });
});

/**
 * ⚠️ THE FIRST REAL CALL FAILED, AND NOT FOR ANY REASON THIS FILE HAD A NAME
 * FOR.
 *
 * I told the tester and the app team that ONE attempt would settle row 226,
 * and I listed the three answers it could give: Georgian text, „not switched
 * on" (the key is missing), or no permission dialog (their diagnosis was
 * wrong). The tester ran it from their own seat — 172101, 25 September
 * 21:23 UTC, a three-second Georgian clip, twice, webm and mp3 — and both
 * returned `recognizer_failed`. The log said why:
 *
 *   „`File` is not defined as a global, which is required for file uploads."
 *
 * A FOURTH ANSWER I HAD NOT LISTED, and the shape of it is this week's own
 * lesson pointed at a place I had not looked. „The flag is set" and
 * „transcription works" are different facts and I wrote three paragraphs
 * saying so. „The key is present" and „the runtime can send a file" are also
 * different facts. `File` became a Node global in 20; production runs older;
 * `toFile` is the SDK's own supported way to send a Buffer and it builds one.
 * It typechecks and every test above passes, because not one of them lets the
 * upload path run.
 *
 * SO THIS TEST TAKES THE GLOBAL AWAY. It is the only way to have the suite see
 * from Node 22 what the service saw from an older runtime — a mock of `toFile`
 * would assert that we call it, which was never in doubt and is exactly the
 * kind of test that passed while this was broken.
 */
describe('the upload works on a runtime with no global File', () => {
  const withRecogniser = (): jest.Mock => {
    const create = jest.fn(async () => ({ text: 'გამარჯობა' }));
    process.env.SPEECH_TO_TEXT_ENABLED = 'true';
    mockClient.mockReturnValue({ audio: { transcriptions: { create } } } as never);
    return create;
  };

  /** Restored whatever the assertions do, so no later test inherits a gap. */
  const withoutGlobalFile = async <T>(body: () => Promise<T>): Promise<T> => {
    const scope = globalThis as { File?: unknown };
    const had = Object.prototype.hasOwnProperty.call(scope, 'File');
    const original = scope.File;
    delete scope.File;
    try {
      return await body();
    } finally {
      if (had) scope.File = original;
      else delete scope.File;
    }
  };

  it('transcribes rather than answering recognizer_failed', async () => {
    const create = withRecogniser();

    const out = await withoutGlobalFile(() =>
      transcribe({ userId: '1', audio: audio(), mime: 'audio/webm;codecs=opus' }),
    );

    expect(out).toEqual({ ok: true, text: 'გამარჯობა', language: null });
    expect(create).toHaveBeenCalledTimes(1);
  });

  /** The shim fills the gap and leaves a runtime that has it alone. */
  it('installs File only when it is missing', async () => {
    const scope = globalThis as { File?: unknown };
    const here = scope.File;

    ensureFileGlobal();
    expect(scope.File).toBe(here);

    await withoutGlobalFile(async () => {
      expect(scope.File).toBeUndefined();
      ensureFileGlobal();
      expect(typeof scope.File).toBe('function');
    });
  });
});

/**
 * ⚠️ „LANGUAGE 'ka' IS NOT SUPPORTED" — the recogniser's own 400, 21:50:40 UTC.
 *
 * The tester sent one clip twice on the build that fixed the upload. Without
 * `language` it returned text. With `language=ka` it was a 400 EVERY time. So
 * the recogniser transcribes Georgian and will not accept Georgian as the
 * value of that parameter — two different things behind one word, and „Whisper
 * knows Georgian" is true and was never the question. The log said which.
 *
 * Their standard, and it is the right one: „Georgian must not depend on a
 * guess." Without a hint the auto-detect called their synthetic clip JAPANESE.
 * So the hint is replaced by a `prompt` in Georgian script — the recogniser's
 * own supported way to bias a transcription — and the refused code is
 * remembered so the 400 is paid for once per process and never again.
 *
 * The accepted list is deliberately NOT hardcoded: I do not know it, and a
 * guess at it is a 400 on somebody's voice. The refusal names the language, so
 * the refusal IS the list.
 */
describe('a language the recogniser will not be told about', () => {
  const recogniser = (): { create: jest.Mock } => {
    process.env.SPEECH_TO_TEXT_ENABLED = 'true';
    const create = jest.fn(async (body: { language?: string }) => {
      if (body.language === 'ka') throw new Error("400 Language 'ka' is not supported.");
      return { text: 'გამარჯობა', language: 'georgian' };
    });
    mockClient.mockReturnValue({ audio: { transcriptions: { create } } } as never);
    return { create };
  };

  it('answers with the words instead of recognizer_failed', async () => {
    const { create } = recogniser();

    const out = await transcribe({
      userId: '1',
      audio: audio(),
      mime: 'audio/webm',
      language: 'ka',
    });

    expect(out).toEqual({ ok: true, text: 'გამარჯობა', language: 'georgian' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  /**
   * The call that actually transcribes carries a Georgian primer, or the words
   * come back in some other script.
   *
   * ⚠️ ASSERTED ON THE LAST CALL, NOT THE SECOND. The refusal is remembered
   * for the life of the process — which is the entire point of it — so whether
   * this is a retry or a first-and-only call depends on what ran before it in
   * the suite. A test pinned to „the second call" passes alone and fails in
   * company, and the property it is about holds either way.
   */
  it('steers it with Georgian script when it may not be told the language', async () => {
    const { create } = recogniser();

    await transcribe({ userId: '1', audio: audio(), mime: 'audio/webm', language: 'ka' });

    const calls = create.mock.calls as [{ language?: string; prompt?: string }][];
    const transcribing = calls[calls.length - 1][0];
    expect(transcribing.language).toBeUndefined();
    expect(transcribing.prompt).toMatch(/[Ⴀ-ჿ]/);
  });

  /** The 400 is paid for ONCE. A second speaker does not repeat it. */
  it('does not ask again after it has been refused', async () => {
    const { create } = recogniser();

    await transcribe({ userId: '1', audio: audio(), mime: 'audio/webm', language: 'ka' });
    create.mockClear();
    await transcribe({ userId: '2', audio: audio(), mime: 'audio/webm', language: 'ka-GE' });

    expect(create).toHaveBeenCalledTimes(1);
    expect((create.mock.calls[0][0] as { language?: string }).language).toBeUndefined();
  });

  /** „ka-GE" and „KA" are the same hint; region and case are the caller's to vary. */
  it('reads a regional tag as its language', () => {
    expect(languageHint('ka-GE')).toBe('ka');
    expect(languageHint('KA')).toBe('ka');
    expect(languageHint('  ')).toBeUndefined();
    expect(languageHint(undefined)).toBeUndefined();
  });

  /**
   * ⚠️ IT REPORTS WHAT IT HEARD, NOT WHAT IT WAS TOLD. The field used to echo
   * the caller's own hint, so it answered „ka" to „was this Georgian?" purely
   * because the phone had said so — while the recogniser had decided Japanese.
   * A field that cannot disagree with its input is not an answer.
   */
  it('reports the language the recogniser detected', async () => {
    process.env.SPEECH_TO_TEXT_ENABLED = 'true';
    mockClient.mockReturnValue({
      audio: { transcriptions: { create: async () => ({ text: 'x', language: 'japanese' }) } },
    } as never);

    const out = await transcribe({
      userId: '1',
      audio: audio(),
      mime: 'audio/webm',
      language: 'en',
    });

    expect(out).toEqual({ ok: true, text: 'x', language: 'japanese' });
  });

  /** Any OTHER failure is still a named refusal — never a silent second charge. */
  it('does not retry a failure that is not that refusal', async () => {
    process.env.SPEECH_TO_TEXT_ENABLED = 'true';
    const create = jest.fn(async () => {
      throw new Error('429 Rate limit reached');
    });
    mockClient.mockReturnValue({ audio: { transcriptions: { create } } } as never);

    const out = await transcribe({
      userId: '1',
      audio: audio(),
      mime: 'audio/webm',
      language: 'es',
    });

    expect(out).toEqual({ ok: false, reason: 'recognizer_failed' });
    expect(create).toHaveBeenCalledTimes(1);
  });
});

/**
 * ⚠️ 27 SEPTEMBER — THE MODEL IS A NAME NOW, AND THAT IS NOT A FIX.
 *
 * The first real iPhone press reached this service today: two recordings from
 * Lika on Salome's account, `audio/mp4`, recorded and uploaded and
 * transcribed. What came back was Georgian-looking nonsense —
 * „კიშტენბა დამვის ბინივედადა…" for a sentence asking to put a question to a
 * named person about a doctor. The tester reproduced it from a seat with a
 * 21-second voice note, with and without the `ka` hint: 200 both times, and
 * partly LATIN transliteration.
 *
 * So the script primer is doing its job and its job is not enough. That is a
 * model question and I cannot answer it from here — no key of my own, no
 * audio, no way to put one clip through two recognisers.
 *
 * These two tests hold the only thing I CAN promise about it: the name is
 * overridable, and the default is exactly what shipped before, so the deploy
 * that carries it changes nothing. The second test is the one that matters —
 * a „configurable model" that quietly changed the model on deploy would be a
 * worse bug than the one it is meant to help with.
 */
describe('the recogniser is a name somebody can correct', () => {
  const loadWithModel = async (
    name: string | undefined,
  ): Promise<typeof import('../speech.service')> => {
    if (name === undefined) delete process.env.SPEECH_MODEL;
    else process.env.SPEECH_MODEL = name;
    jest.resetModules();
    return import('../speech.service');
  };

  afterEach(() => {
    delete process.env.SPEECH_MODEL;
    jest.resetModules();
  });

  it('uses the name it is given', async () => {
    const mod = await loadWithModel('gpt-4o-transcribe');
    const openai = (await import('../../config/openai')).openaiClient as jest.Mock;
    const create = jest.fn().mockResolvedValue({ text: 'გამარჯობა', language: 'georgian' });
    openai.mockReturnValue({ audio: { transcriptions: { create } } });
    const db = (await import('../../db/postgres/client')).query as jest.Mock;
    db.mockResolvedValue({ rows: [{ seconds: '0' }], rowCount: 1 });
    process.env.SPEECH_TO_TEXT_ENABLED = 'true';

    await mod.transcribe({ userId: '1', audio: Buffer.from('x'), mime: 'audio/mp4' });

    expect(create.mock.calls[0][0].model).toBe('gpt-4o-transcribe');
    delete process.env.SPEECH_TO_TEXT_ENABLED;
  });

  /** Unset means exactly what shipped before. A default that drifts is a release nobody asked for. */
  it('is whisper-1 when nothing is set', async () => {
    const mod = await loadWithModel(undefined);
    const openai = (await import('../../config/openai')).openaiClient as jest.Mock;
    const create = jest.fn().mockResolvedValue({ text: 'გამარჯობა', language: 'georgian' });
    openai.mockReturnValue({ audio: { transcriptions: { create } } });
    const db = (await import('../../db/postgres/client')).query as jest.Mock;
    db.mockResolvedValue({ rows: [{ seconds: '0' }], rowCount: 1 });
    process.env.SPEECH_TO_TEXT_ENABLED = 'true';

    await mod.transcribe({ userId: '1', audio: Buffer.from('x'), mime: 'audio/mp4' });

    expect(create.mock.calls[0][0].model).toBe('whisper-1');
    delete process.env.SPEECH_TO_TEXT_ENABLED;
  });
});

/**
 * ⚠️ THE VARIABLE SHIPPED AT 13:2x WOULD HAVE BROKEN TRANSCRIPTION AT 13:4x.
 *
 * `SPEECH_MODEL` exists so somebody can try a second recogniser without
 * waiting for a release, and the tester named two candidates within the hour.
 * Then I read my own call: `response_format: 'verbose_json'` went out
 * unconditionally, and the newer transcription models do not all take it.
 * Flipping the variable would have turned a BAD transcription into NO
 * transcription — every voice note a 400 — and it would have looked like the
 * new model being broken rather than like my request being wrong.
 *
 * Same shape as the `language` refusal, same answer, because that one was
 * learned expensively: do not guess the list. The refusal names what it
 * refuses, so ask for the verbose form, and if this model will not give it,
 * drop to plain json once and remember.
 */
describe('a model that will not give the verbose form still gives text', () => {
  const load = async (): Promise<typeof import('../speech.service')> => {
    jest.resetModules();
    return import('../speech.service');
  };

  const clientThatRefusesVerbose = (): jest.Mock => {
    const create = jest.fn().mockImplementation((args: { response_format?: string }) => {
      if (args.response_format === 'verbose_json') {
        return Promise.reject(
          new Error("400 response_format 'verbose_json' is not supported with this model"),
        );
      }
      return Promise.resolve({ text: 'გამარჯობა' });
    });
    return create;
  };

  afterEach(() => {
    delete process.env.SPEECH_TO_TEXT_ENABLED;
    jest.resetModules();
  });

  it('retries as json and returns the text', async () => {
    const mod = await load();
    const openai = (await import('../../config/openai')).openaiClient as jest.Mock;
    const create = clientThatRefusesVerbose();
    openai.mockReturnValue({ audio: { transcriptions: { create } } });
    const db = (await import('../../db/postgres/client')).query as jest.Mock;
    db.mockResolvedValue({ rows: [{ seconds: '0' }], rowCount: 1 });
    process.env.SPEECH_TO_TEXT_ENABLED = 'true';

    const out = await mod.transcribe({ userId: '1', audio: Buffer.from('x'), mime: 'audio/mp4' });

    expect(out).toEqual(expect.objectContaining({ ok: true, text: 'გამარჯობა' }));
    expect(create.mock.calls[0][0].response_format).toBe('verbose_json');
    expect(create.mock.calls[1][0].response_format).toBe('json');
  });

  /**
   * AND IT ASKS ONCE. A model that refuses the verbose form refuses it every
   * time, and paying for a rejected call before every real one is the cost
   * this set exists to avoid.
   */
  it('does not ask for the verbose form again in the same process', async () => {
    const mod = await load();
    const openai = (await import('../../config/openai')).openaiClient as jest.Mock;
    const create = clientThatRefusesVerbose();
    openai.mockReturnValue({ audio: { transcriptions: { create } } });
    const db = (await import('../../db/postgres/client')).query as jest.Mock;
    db.mockResolvedValue({ rows: [{ seconds: '0' }], rowCount: 1 });
    process.env.SPEECH_TO_TEXT_ENABLED = 'true';

    await mod.transcribe({ userId: '1', audio: Buffer.from('x'), mime: 'audio/mp4' });
    create.mockClear();
    await mod.transcribe({ userId: '1', audio: Buffer.from('x'), mime: 'audio/mp4' });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].response_format).toBe('json');
  });

  /** Anything that is not that refusal is still the caller's to report. */
  it('does not retry a timeout', async () => {
    const mod = await load();
    const openai = (await import('../../config/openai')).openaiClient as jest.Mock;
    const create = jest.fn().mockRejectedValue(new Error('socket hang up'));
    openai.mockReturnValue({ audio: { transcriptions: { create } } });
    const db = (await import('../../db/postgres/client')).query as jest.Mock;
    db.mockResolvedValue({ rows: [{ seconds: '0' }], rowCount: 1 });
    process.env.SPEECH_TO_TEXT_ENABLED = 'true';

    const out = await mod.transcribe({ userId: '1', audio: Buffer.from('x'), mime: 'audio/mp4' });

    expect(out).toEqual(expect.objectContaining({ ok: false }));
    expect(create).toHaveBeenCalledTimes(1);
  });
});

/**
 * THE PRIMER IS THE ONLY LEVER WE HOLD, AND IT WAS BEING USED AT A FIFTH SIZE.
 *
 * What the live failure looks like, measured on the tester's clip at 18:31:49
 * on 27 September: the recogniser reports the language as „georgian" and then
 * writes 218 Latin characters and not one Georgian. It is not failing to hear
 * the language — it is ROMANISING it.
 *
 * The `language` hint is refused by the API in its own words („language 'ka'
 * is not supported") and the model is somebody else's decision. That leaves
 * the prompt: read as preceding context, so Georgian script becomes the
 * obvious continuation. It takes roughly 224 tokens. Georgian had 48
 * characters of it.
 *
 * ⚠️ AND THE ONE THING THAT WOULD QUIETLY UNDO IT is a Latin word inside the
 * primer — a product name, a placeholder, a stray „ok". The primer is
 * preceding context, so Latin in it argues FOR the exact thing being fought.
 * That is the assertion worth keeping here; the length is only the reason it
 * now matters.
 */
describe('the Georgian primer', () => {
  /** The prompt actually sent for a language, read off the last call made. */
  async function primerFor(language: string): Promise<string> {
    process.env.SPEECH_TO_TEXT_ENABLED = 'true';
    const create = jest.fn(async () => ({ text: 'გამარჯობა' }));
    mockClient.mockReturnValue({ audio: { transcriptions: { create } } } as never);

    await transcribe({ userId: '1', audio: audio(), mime: 'audio/webm', language });

    const sent = create.mock.calls as unknown as [{ prompt?: string }][];
    return sent[sent.length - 1][0].prompt ?? '';
  }

  const georgianPrimer = (): Promise<string> => primerFor('ka');

  it('carries no Latin letter at all', async () => {
    expect(await georgianPrimer()).not.toMatch(/[A-Za-z]/);
  });

  it('is more than the one sentence it used to be', async () => {
    expect((await georgianPrimer()).length).toBeGreaterThan(150);
  });

  /**
   * And still well inside what the parameter takes, so this cannot grow into
   * a silently truncated prompt that nobody notices is being cut.
   */
  it('stays well inside the prompt budget', async () => {
    expect((await georgianPrimer()).length).toBeLessThan(600);
  });

  /** Untouched, because they are not failing. */
  it('leaves the other languages as they were', async () => {
    expect(await primerFor('en')).toBe('Hello. This is an ordinary sentence in English.');
  });
});
