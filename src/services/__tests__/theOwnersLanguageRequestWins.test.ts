import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { askedLanguage, requestedLanguage } from '../languagePreference';

jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

const mockQuery = query as jest.MockedFunction<typeof query>;

/** D752 (the founder, 9 Oct): „Users request toward their assistant always wins". */
describe('a language the owner asks for', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['მომწერე ინგლისურად, გთხოვ', 'en'],
    ['ინგლისურად მელაპარაკე', 'en'],
    ['please write to me in Georgian', 'ka'],
    ['Can you reply in Russian?', 'ru'],
    ['пиши по-английски', 'en'],
    ['escríbeme en español', 'es'],
    ['გადადი რუსულად', 'ru'],
  ])('reads „%s" as %s', (line, language) => {
    expect(requestedLanguage(line)).toBe(language);
  });

  it.each([
    'ინგლისური ვიცი კარგად',
    'I need an English teacher',
    'Do you speak English? I have a Russian client',
    'not in English, in Georgian please write',
  ])('does not read „%s" as a request', (line) => {
    expect(requestedLanguage(line)).toBeNull();
  });

  it('is remembered when asked, and wins later without asking again', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await expect(askedLanguage('42', 'მომწერე ინგლისურად')).resolves.toBe('en');
    expect(String(mockQuery.mock.calls[0][0])).toContain('INSERT INTO user_profile_kv');
    expect(mockQuery.mock.calls[0][1]).toEqual(['42', 'reply_language', 'en']);

    mockQuery.mockResolvedValueOnce({ rows: [{ value: 'en' }] } as never);
    await expect(askedLanguage('42', 'კარგი, მადლობა')).resolves.toBe('en');
  });

  it('keeps the caller’s reading when nobody asked, or the read fails', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await expect(askedLanguage('42', 'გამარჯობა')).resolves.toBeNull();
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    await expect(askedLanguage('42', 'გამარჯობა')).resolves.toBeNull();
  });

  it('is read before the conversation in the run, userLanguage and threadLanguage', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('await askedLanguage(userId, userMessage)');
    const threads = readFileSync(join(__dirname, '..', 'threads.service.ts'), 'utf8');
    const userLang = threads.slice(threads.indexOf('export async function userLanguage'));
    expect(userLang.indexOf('languagePreference(userId)')).toBeLessThan(
      userLang.indexOf('const [latest, ...earlier]'),
    );
    const threadLang = threads.slice(threads.indexOf('export async function threadLanguage'));
    expect(threadLang.indexOf('threadLanguagePreference(threadId)')).toBeLessThan(
      threadLang.indexOf('await ownerMessages(threadId)'),
    );
  });
});
