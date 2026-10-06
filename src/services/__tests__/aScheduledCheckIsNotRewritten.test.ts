import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Misho's N, 6 October: GPT is not called on a run nobody started. 18 of 69
 * rewrites came back empty, almost all scheduled checks, and Claude's own text
 * stood every time — the owner never saw a difference, the call only cost.
 */
const ENV_KEYS = ['CHAT_FINAL_ANSWER_MODEL', 'CHAT_SMALL_TALK_FINAL_MODEL'] as const;
const savedEnv = ENV_KEYS.map((key) => [key, process.env[key]] as const);

afterAll(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function writerFor(ownerAbsent: boolean, smallTalkOnly: boolean): Promise<string> {
  process.env.CHAT_FINAL_ANSWER_MODEL = 'big-writer';
  process.env.CHAT_SMALL_TALK_FINAL_MODEL = 'small-writer';
  jest.resetModules();
  return (await import('../finalAnswer.service')).finalWriterForRun(ownerAbsent, smallTalkOnly);
}

describe('the final writer of a run nobody started', () => {
  it('is nobody on a scheduled check or wake', async () => {
    await expect(writerFor(true, false)).resolves.toBe('');
    await expect(writerFor(true, true)).resolves.toBe('');
  });

  it('is unchanged when the owner wrote', async () => {
    await expect(writerFor(false, false)).resolves.toBe('big-writer');
    await expect(writerFor(false, true)).resolves.toBe('small-writer');
  });

  it('is what the run loop asks, and the small-talk fallback cannot bring GPT back', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('const writer = finalWriterForRun(ownerAbsent, smallTalkOnly);');
    expect(chat).toContain("      smallTalkOnly &&\n      writer !== '' &&");
  });
});
