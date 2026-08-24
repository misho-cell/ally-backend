jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../userPrivateContext.service', () => ({
  __esModule: true,
  savePrivateContext: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../tools/webSearch', () => ({ __esModule: true, webSearch: jest.fn() }));

import { query } from '../../db/postgres/client';
import { savePrivateContext } from '../userPrivateContext.service';
import { webSearch } from '../tools/webSearch';
import { runWelcomeStudy } from '../welcomeStudy.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSave = savePrivateContext as jest.MockedFunction<typeof savePrivateContext>;
const mockWebSearch = webSearch as jest.MockedFunction<typeof webSearch>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue(rows([]) as never);
  mockWebSearch.mockResolvedValue({ results: [] });
});

describe('runWelcomeStudy (engine T13)', () => {
  it('does nothing for an unparseable phone — never touches the database', async () => {
    await runWelcomeStudy('7', 'გია', 'not-a-phone');

    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('combines labels, old-Ally standing, and web results into one saved note', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM "UserAlias"'))
        return Promise.resolve(rows([{ alias: 'გია სანტექნიკოსი' }]) as never);
      if (sql.includes('FROM "UserTags"'))
        return Promise.resolve(rows([{ tag: 'trusted' }]) as never);
      if (sql.includes('FROM "UserConnectionPhone"'))
        return Promise.resolve(rows([{ status: 'allies', count: '3' }]) as never);
      return Promise.resolve(rows([]) as never);
    });
    mockWebSearch.mockResolvedValue({
      results: [{ title: 'Gia at ACME', url: 'https://acme.example', snippet: 'Head of sales' }],
    });

    await runWelcomeStudy('7', 'Gia Test', '+995599111222');

    expect(mockSave).toHaveBeenCalledTimes(1);
    const [userId, key, value, mode] = mockSave.mock.calls[0];
    expect(userId).toBe('7');
    expect(key).toBe('welcome_study');
    expect(mode).toBe('set');
    expect(value).toContain('გია სანტექნიკოსი');
    expect(value).toContain('trusted');
    expect(value).toContain('allies: 3');
    expect(value).toContain('Gia at ACME');
  });

  it('never touches contact_facts — private notes about the person are out of scope', async () => {
    await runWelcomeStudy('7', 'Gia', '+995599111222');

    const sqlCalls = mockQuery.mock.calls.map(([sql]) => sql as string);
    expect(sqlCalls.some((sql) => sql.includes('contact_facts'))).toBe(false);
  });

  it('saves nothing when every source comes back empty', async () => {
    await runWelcomeStudy('7', 'Gia', '+995599111222');

    expect(mockSave).not.toHaveBeenCalled();
  });

  it('never throws when a query fails', async () => {
    mockQuery.mockRejectedValue(new Error('db down'));

    await expect(runWelcomeStudy('7', 'Gia', '+995599111222')).resolves.toBeUndefined();
    expect(mockSave).not.toHaveBeenCalled();
  });
});
