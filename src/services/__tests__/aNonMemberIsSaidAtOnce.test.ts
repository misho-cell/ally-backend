jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { namedKnower, nonMemberAnswer, savedNonMember } from '../namedNonMember';

/**
 * 3203 (Lika's phone, 8 Oct): „ჩემი კონტაქტებიდან <name> იცნობს თუ არა ვინმე
 * კარგ ხელოსანს?" about a contact not on Netai got two questions and a promise
 * to ask her. The server now says at once that she is not on Netai.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

beforeEach(() => mockQuery.mockReset());

describe('the line asks about one saved person', () => {
  it.each([
    ['ჩემი კონტაქტებიდან ნინო ტესტაძე იცნობს თუ არა ვინმე კარგ ხელოსანს?', 'ნინო ტესტაძე'],
    ['ნინო ტესტაძე თუ იცნობს კარგ ხელოსანს?', 'ნინო ტესტაძე'],
    ['ჩემს კონტაქტებში ანა მარია ბერიძე იცნობს ექიმს?', 'ანა მარია ბერიძე'],
  ])('%s', (line, name) => {
    expect(namedKnower(line)).toBe(name);
  });

  it.each([
    'ვინ იცნობს კარგ ხელოსანს?',
    'ნინო იცნობს ხელოსანს?',
    'მჭირდება კარგი ხელოსანი',
    'ჰკითხე ნინო ტესტაძეს, იცნობს თუ არა ხელოსანს',
  ])('not: %s', (line) => {
    expect(namedKnower(line)).toBeNull();
  });
});

describe('only one saved number with no account counts', () => {
  it('a non-member is named as saved', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ alias: 'ნინო ტესტაძე', phones: 1, members: 0 }],
    } as never);
    expect(await savedNonMember('165699', 'ნინო ტესტაძე')).toBe('ნინო ტესტაძე');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('"contactId" = $1::int');
    expect(sql).toContain('LOWER(TRANSLATE(TRIM(ua.alias)');
    expect(sql).toContain('LIMIT 1');
    expect(params).toEqual(['165699', 'ნინო ტესტაძე']);
  });

  it('a member, two numbers, nobody, or a failed read: null', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ alias: 'x', phones: 1, members: 1 }] } as never);
    expect(await savedNonMember('1', 'x y')).toBeNull();
    mockQuery.mockResolvedValueOnce({ rows: [{ alias: 'x', phones: 2, members: 0 }] } as never);
    expect(await savedNonMember('1', 'x y')).toBeNull();
    mockQuery.mockResolvedValueOnce({ rows: [{ alias: null, phones: 0, members: 0 }] } as never);
    expect(await savedNonMember('1', 'x y')).toBeNull();
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    expect(await savedNonMember('1', 'x y')).toBeNull();
    quiet.mockRestore();
  });
});

describe('the answer', () => {
  it('says she is not on Netai, asks nothing, promises nothing, offers the two ways', () => {
    const answer = nonMemberAnswer('ნინო ტესტაძე', 'ka');
    expect(answer.text).toContain('ნინო ტესტაძე Netai-ზე არ არის');
    expect(answer.text).not.toContain('?');
    expect(answer.choices).toEqual(['მოვიწვიოთ', 'სხვებს ვკითხოთ']);
    expect(nonMemberAnswer('Nino', 'en').text).toContain('Nino is not on Netai');
  });

  it('is given before any goal is opened or model called, for the owner only', () => {
    const at = chat.indexOf(
      'await answerNonMemberNamed(userId, threadId, userMessage, runId, intent)',
    );
    expect(at).toBeGreaterThan(0);
    expect(chat.indexOf('const goalForRequest = await ensureGoalForRequest(')).toBeGreaterThan(at);
    expect(chat).toContain("serverMayAnswer && thread.type === 'regular'");
  });
});
