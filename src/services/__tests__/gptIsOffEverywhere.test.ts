jest.mock('../../config/openai', () => ({ __esModule: true, openaiClient: () => ({}) }));

/**
 * Misho, 11 Nov („ჯიპიტის ნაწილი სრულად ჩაგვეხსნა"): with a GPT model and a
 * key still configured, GPT searches nothing unless GPT is switched on.
 */
function searchAvailable(gptOn: boolean): boolean {
  process.env.CHAT_FINAL_ANSWER_MODEL = 'gpt-test';
  if (gptOn) process.env.GPT_WRITES_ANSWERS = 'true';
  else delete process.env.GPT_WRITES_ANSWERS;
  let available = false;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../tools/openaiWebSearch') as typeof import('../tools/openaiWebSearch');
    available = mod.openaiWebSearchAvailable();
  });
  return available;
}

describe('GPT', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('does not search the web while it is off, even with a model and a key', () => {
    expect(searchAvailable(false)).toBe(false);
  });

  it('searches again only when switched back on', () => {
    expect(searchAvailable(true)).toBe(true);
  });
});
