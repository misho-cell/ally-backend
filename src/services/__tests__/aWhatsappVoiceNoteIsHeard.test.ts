const mockTranscribe = jest.fn();
jest.mock('../speech.service', () => ({
  transcribe: (...args: unknown[]) => mockTranscribe(...args),
}));

import { inboundMessagesOf } from '../whatsappInbound.service';
import {
  heardLine,
  lineForRefusal,
  oggDurationMs,
  VOICE_LINES,
  voiceNoteText,
  WHATSAPP_VOICE_MAX_MS,
} from '../whatsappVoice.service';

/**
 * Misho, 4 Nov: a member speaks to Netai in WhatsApp. The voice note is read by
 * the app's recogniser, up to 3 minutes, and what was heard is read back first.
 */
const PHONE = '995500000000';
const fetchMock = jest.fn();

function oggPage(granule: bigint, body = ''): Buffer {
  const head = Buffer.alloc(27);
  head.write('OggS', 0, 'latin1');
  head.writeBigInt64LE(granule, 6);
  return Buffer.concat([head, Buffer.from(body, 'latin1')]);
}

function opusHead(preSkip: number): Buffer {
  const b = Buffer.alloc(19);
  b.write('OpusHead', 0, 'latin1');
  b.writeUInt16LE(preSkip, 10);
  return b;
}

beforeEach(() => {
  mockTranscribe.mockReset();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  process.env.WHATSAPP_TOKEN = 'token-for-tests';
  process.env.WHATSAPP_VOICE_ON = 'true';
});

describe('a WhatsApp voice note', () => {
  it('is taken from a delivery with its media id', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: { messages: [{ from: PHONE, id: 'w9', type: 'audio', audio: { id: 'm1' } }] },
            },
          ],
        },
      ],
    };
    expect(inboundMessagesOf(payload)).toEqual([
      { from: PHONE, wamid: 'w9', text: '', replyTo: null, voiceId: 'm1' },
    ]);
  });

  it('has its length read from the last Ogg page, less the pre-skip', () => {
    const audio = Buffer.concat([oggPage(0n), opusHead(312), oggPage(BigInt(48 * 2000 + 312))]);
    expect(oggDurationMs(audio)).toBe(2000);
  });

  it('has no length when the file is not Ogg', () => {
    expect(oggDurationMs(Buffer.from('not audio'))).toBeNull();
  });

  it('is read back first, cut at a word when long', () => {
    expect(heardLine(' გამარჯობა,  ნეტაი ')).toBe('🎤 გავიგე: „გამარჯობა, ნეტაი"');
    const long = heardLine('სიტყვა '.repeat(100));
    expect(long.endsWith('…"')).toBe(true);
    expect(long.length).toBeLessThan(330);
  });

  it('is answered with a line that says why when it cannot be read', () => {
    expect(lineForRefusal({ ok: false, reason: 'too_long' })).toBe(VOICE_LINES.tooLong);
    expect(lineForRefusal({ ok: false, reason: 'daily_limit' })).toBe(VOICE_LINES.dailyLimit);
    expect(lineForRefusal({ ok: false, reason: 'no_speech' })).toBe(VOICE_LINES.notHeard);
    expect(lineForRefusal({ ok: false, reason: 'not_enabled' })).toBe(VOICE_LINES.off);
  });

  it('is not fetched while the switch is off', async () => {
    process.env.WHATSAPP_VOICE_ON = 'false';
    expect(await voiceNoteText(1, 'm1')).toEqual({ refusal: VOICE_LINES.off });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is fetched from Meta and transcribed with the 3-minute limit', async () => {
    const audio = Buffer.concat([opusHead(0), oggPage(BigInt(48 * 5000))]);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://media.example/x', mime_type: 'audio/ogg; codecs=opus' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () =>
          audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.length),
      });
    mockTranscribe.mockResolvedValue({ ok: true, text: 'გამარჯობა', language: 'ka' });

    expect(await voiceNoteText(7, 'm1')).toEqual({ text: 'გამარჯობა' });
    const input = mockTranscribe.mock.calls[0][0];
    expect(input).toMatchObject({ userId: '7', durationMs: 5000, maxMs: WHATSAPP_VOICE_MAX_MS });
    expect(fetchMock.mock.calls[1][0]).toBe('https://media.example/x');
  });

  it('is answered „not heard" when Meta does not give the file', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
    expect(await voiceNoteText(7, 'm1')).toEqual({ refusal: VOICE_LINES.notHeard });
    expect(mockTranscribe).not.toHaveBeenCalled();
  });
});
