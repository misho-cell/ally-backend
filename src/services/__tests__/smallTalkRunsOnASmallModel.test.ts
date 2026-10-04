import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * D627 (the founder, 4 October, the tester's 1134): small talk runs on a
 * smaller, faster model on both sides. „როგორ ხარ?" waited 11 s for the full
 * model's first word (36639).
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

const ENV_KEYS = ['CHAT_FINAL_ANSWER_MODEL', 'CHAT_SMALL_TALK_FINAL_MODEL'] as const;
const savedEnv = ENV_KEYS.map((key) => [key, process.env[key]] as const);

afterAll(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function smallTalkFinalModelWith(
  finalModel: string | undefined,
  smallModel: string | undefined,
): Promise<string> {
  for (const [key, value] of [
    ['CHAT_FINAL_ANSWER_MODEL', finalModel],
    ['CHAT_SMALL_TALK_FINAL_MODEL', smallModel],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  jest.resetModules();
  return (await import('../finalAnswer.service')).smallTalkFinalModel();
}

describe('the small-talk turn', () => {
  it('asks the small Claude model, and only on listed small talk', () => {
    expect(chat).toContain("|| 'claude-haiku-4-5-20251001';");
    expect(chat).toContain('model: smallTalkOnly ? SMALL_TALK_MODEL : TOOL_TURN_MODEL,');
  });

  it('is rewritten by the small writer when one is set', async () => {
    expect(chat).toContain(
      'let rewritten = await writeWith(smallTalkOnly ? smallTalkFinalModel() : finalAnswerModel());',
    );
    await expect(smallTalkFinalModelWith('big-writer', 'small-writer')).resolves.toBe(
      'small-writer',
    );
  });

  it('hands the turn to the ordinary writer when the small one fails before a word', () => {
    expect(chat).toContain('smallTalkFinalModel() !== finalAnswerModel()');
    expect(chat).toContain('rewritten = await writeWith(finalAnswerModel());');
  });

  it('keeps the ordinary writer when no small one is set', async () => {
    await expect(smallTalkFinalModelWith('big-writer', undefined)).resolves.toBe('big-writer');
  });

  it('writes nothing through GPT when the final writer is off', async () => {
    await expect(smallTalkFinalModelWith(undefined, 'small-writer')).resolves.toBe('');
  });
});
