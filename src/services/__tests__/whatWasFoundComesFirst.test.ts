jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { hasWebResults } from '../chat.service';

describe('a web search with results', () => {
  it('counts only when rows came back', () => {
    expect(hasWebResults({ results: [{ title: 'კლინიკა' }] })).toBe(true);
    expect(hasWebResults({ results: [] })).toBe(false);
    expect(hasWebResults({ error: 'timeout' })).toBe(false);
    expect(hasWebResults(null)).toBe(false);
  });
});

/** #8948 (battery 5 Nov): the note forced a second reply; it is no longer sent. */
describe('the note', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('is never sent, only still filtered out of a stored history', () => {
    expect(chat).not.toContain('? FINDS_FIRST_NUDGE');
    expect(chat).toContain('  FINDS_FIRST_NUDGE,');
  });
});
