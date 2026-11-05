import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Misho's N, 6 October: GPT is not called on a run nobody started. 18 of 69
 * rewrites came back empty, almost all scheduled checks, and Claude's own text
 * stood every time — the owner never saw a difference, the call only cost.
 */
const savedModel = process.env.CHAT_FINAL_ANSWER_MODEL;

afterAll(() => {
  if (savedModel === undefined) delete process.env.CHAT_FINAL_ANSWER_MODEL;
  else process.env.CHAT_FINAL_ANSWER_MODEL = savedModel;
});

async function writerFor(ownerAbsent: boolean): Promise<string> {
  process.env.CHAT_FINAL_ANSWER_MODEL = 'big-writer';
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

  it('is what the run loop asks', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('const writer = finalWriterForRun(ownerAbsent);');
  });
});
