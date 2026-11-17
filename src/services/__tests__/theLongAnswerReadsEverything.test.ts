jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordClaudeUsage: jest.fn().mockResolvedValue(undefined),
}));
const create = jest.fn();
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: (...args: unknown[]) => create(...args) } },
}));

import { beforeDeadline, RESEARCH_BUDGET_MS } from '../fullResearch.service';
import { wayInNamesFromAll } from '../wayInNames.service';

const ORIGIN = { userId: '186272', threadId: 1 };

/**
 * The tester's second round, 17 Nov: the long answer's web level had 60
 * results and named the companies from the first 8. Misho: let the long
 * answer take up to half an hour.
 */
describe('the long answer reads everything it found', () => {
  beforeEach(() => create.mockReset());

  it('names companies from every result, eight titles at a time, each once', async () => {
    const results = Array.from({ length: 20 }, (_, i) => ({ title: `Firm ${i} — branded mugs` }));
    create.mockImplementation(async (req: { messages: { content: string }[] }) => ({
      usage: {},
      content: [
        {
          type: 'text',
          text: (req.messages[0]?.content ?? '')
            .split('\n')
            .map((t) => t.split(' — ')[0])
            .concat(['Firm 0'])
            .join('\n'),
        },
      ],
    }));
    const names = await wayInNamesFromAll({ results }, 20, ORIGIN);
    expect(create).toHaveBeenCalledTimes(3);
    expect(names).toHaveLength(20);
    expect(names[19]).toBe('Firm 19');
  });

  it('gives the research thirty minutes, then stops what is still running', async () => {
    expect(RESEARCH_BUDGET_MS).toBe(30 * 60 * 1000);
    await expect(beforeDeadline(Promise.resolve('done'), Date.now() + 1000)).resolves.toBe('done');
    await expect(beforeDeadline(new Promise(() => undefined), Date.now() + 5)).rejects.toThrow(
      'the research ran out of time',
    );
    await expect(beforeDeadline(Promise.resolve('late'), Date.now() - 1)).rejects.toThrow(
      'the research ran out of time',
    );
  });
});
