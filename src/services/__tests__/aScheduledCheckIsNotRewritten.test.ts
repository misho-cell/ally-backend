import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Misho's N, 6 October: GPT is not called on a run nobody started. 18 of 69
 * rewrites came back empty, almost all scheduled checks, and Claude's own text
 * stood every time — the owner never saw a difference, the call only cost.
 */
const savedModel = process.env.CHAT_FINAL_ANSWER_MODEL;
const savedSwitch = process.env.GPT_WRITES_ANSWERS;

afterAll(() => {
  if (savedModel === undefined) delete process.env.CHAT_FINAL_ANSWER_MODEL;
  else process.env.CHAT_FINAL_ANSWER_MODEL = savedModel;
  if (savedSwitch === undefined) delete process.env.GPT_WRITES_ANSWERS;
  else process.env.GPT_WRITES_ANSWERS = savedSwitch;
});

async function writerFor(ownerAbsent: boolean, gptWrites = 'true'): Promise<string> {
  process.env.CHAT_FINAL_ANSWER_MODEL = 'big-writer';
  process.env.GPT_WRITES_ANSWERS = gptWrites;
  jest.resetModules();
  return (await import('../finalAnswer.service')).finalWriterForRun(ownerAbsent);
}

describe('the final writer of a run nobody started', () => {
  it('is nobody on a scheduled check or wake', async () => {
    await expect(writerFor(true)).resolves.toBe('');
  });

  it('is unchanged when the owner wrote', async () => {
    await expect(writerFor(false)).resolves.toBe('big-writer');
  });

  // Misho, 9 Nov: Claude writes the answer; GPT only when the switch brings it back.
  it('is nobody unless GPT_WRITES_ANSWERS is on, whatever model is configured', async () => {
    await expect(writerFor(false, '')).resolves.toBe('');
  });

  it('is what the run loop asks', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('const writer = finalWriterForRun(ownerAbsent);');
  });
});
