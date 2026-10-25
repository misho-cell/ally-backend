jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { askStepNames } from '../askCaptions';
import { namedStepCaption } from '../runLanguage';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => mockQuery.mockReset());

/** #7631 (tester 75971, thread 65775): „✉️ Writing to Sandro G.'s assistant…". */
describe('an ask step line', () => {
  it('names the person by the clean name, not the owner’s raw label', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ alias: 'Sandro G.', registered: 'Sandro Gelashvili' }],
    } as never);
    const names = await askStepNames('5', [
      {
        id: 'a',
        name: 'ask_contact',
        input: { phone: '+995500000001', contact_name: 'Sandro G.' },
      },
      { id: 'b', name: 'web_search', input: { query: 'x' } },
    ]);
    expect([...names.entries()]).toEqual([['a', 'Sandro Gelashvili']]);
    expect(namedStepCaption('ask_contact', { contact_name: names.get('a') }, 'en')).toBe(
      "✉️ Writing to Sandro Gelashvili's assistant…",
    );
  });

  it('keeps the given name when the read fails', async () => {
    mockQuery.mockRejectedValue(new Error('timeout'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const names = await askStepNames('5', [
      {
        id: 'a',
        name: 'ask_contact',
        input: { phone: '+995500000001', contact_name: 'Sandro G.' },
      },
    ]);
    expect(names.size).toBe(0);
    warn.mockRestore();
  });

  it('is what the run shows', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('namedStepCaption(block.name, captionInput, runLang(runId))');
  });
});
