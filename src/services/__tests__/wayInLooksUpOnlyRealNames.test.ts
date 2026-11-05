const mockCreate = jest.fn();
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: (...args: unknown[]) => mockCreate(...args) } },
}));
jest.mock('../costLedger.service', () => ({ recordClaudeUsage: jest.fn(async () => undefined) }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { namesInTitles, wayInNamesFrom } from '../wayInNames.service';

const RESULT = {
  results: [
    { title: 'მოძებნე და იპოვეთ ელექტრიკოსი თბილისში' },
    { title: 'Mister Repairs — Emergency electricians | Tbilisi' },
    { title: 'ElektroService LLC - Contact' },
  ],
};
const ORIGIN = { userId: '501', runId: 'run-1', threadId: 9 };

beforeEach(() => mockCreate.mockReset());

/** #8648: on 4 Nov 653 of 711 way_in lookups found nobody — headline words, not names. */
describe('#8648: the way-in lookup looks up only real names', () => {
  it('keeps the names the small model read, in order, and only those standing in a title', () => {
    const reply = 'Mister Repairs\n- ElektroService LLC\nGeorgian Power Company\nmister repairs';
    const titles = RESULT.results.map((r) => r.title);
    expect(namesInTitles(reply, titles, 3)).toEqual(['Mister Repairs', 'ElektroService LLC']);
  });

  it('looks up nothing when the model says none, or when there are no titles', async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'none' }], usage: {} });
    await expect(wayInNamesFrom(RESULT, 3, ORIGIN)).resolves.toEqual([]);
    await expect(wayInNamesFrom({ results: [] }, 3, ORIGIN)).resolves.toEqual([]);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('caps the names at the limit', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Mister Repairs\nElektroService LLC' }],
      usage: {},
    });
    await expect(wayInNamesFrom(RESULT, 1, ORIGIN)).resolves.toEqual(['Mister Repairs']);
  });

  it('looks up nothing when the model fails, and says so in the log', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockCreate.mockRejectedValueOnce(new Error('overloaded'));
    await expect(wayInNamesFrom(RESULT, 3, ORIGIN)).resolves.toEqual([]);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('is what both way-in callers look up', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const opening = readFileSync(join(__dirname, '..', 'openingSearch.service.ts'), 'utf8');
    expect(chat).toContain(
      'await wayInNamesFrom(found, MAX_WAY_IN_CHECKS, { userId, runId, threadId })',
    );
    expect(opening).toContain(
      'const names = await wayInNamesFrom(raw, MAX_WAY_IN_CHECKS, { userId, runId, threadId });',
    );
    expect(opening).not.toContain('findWaysIn(userId, webResultNames(raw)');
  });
});
