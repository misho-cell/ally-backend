jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../languagePreference', () => ({
  languagePreference: jest.fn().mockResolvedValue('ka'),
  threadLanguagePreference: jest.fn().mockResolvedValue('ka'),
}));
jest.mock('../askTranslation.service', () => ({
  relayedForReader: jest.fn((text: string) => Promise.resolve({ text })),
}));

import { query } from '../../db/postgres/client';
import { introRequestChoices } from '../pendingMessages';
import { createIncomingRequestThread } from '../threads.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/** #6040 (IN-004, 4 of 4): the request's own conversation opened with no buttons. */
describe('#6040: an introduction request has its buttons in its own conversation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({
      rows: [{ id: 59819, title: 't', created_at: new Date('2026-10-19T00:00:00Z') }],
    } as never);
  });

  it('offers accept and decline, no later (D586)', () => {
    expect(introRequestChoices('ka', 'ნიკა', 'ლევანი')).toEqual([
      'დიახ, გავაცნობ ლევანს',
      'არა, ამჯერად არა',
    ]);
    expect(introRequestChoices('en', 'Nika', null)).toEqual([
      'Yes, I will meet Nika',
      'No, not now',
    ]);
  });

  it('saves them with the opening line', async () => {
    await createIncomingRequestThread(188350, 901, 'ნიკა', 'ლევანი', null);
    const opening = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO conversations'),
    );
    const params = (opening?.[1] ?? []) as unknown[];
    expect(JSON.parse(String(params[6]))).toEqual(introRequestChoices('ka', 'ნიკა', 'ლევანი'));
  });
});
