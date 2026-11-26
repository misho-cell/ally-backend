/**
 * Misho, 26 Nov (Giorgi's snowboard case): the answer was right, then its last
 * question named an own contact no search had brought. A line naming an own
 * contact that the run never read is taken out; everyone the run did read stays.
 */
const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...args: unknown[]): unknown => mockQuery(...args),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  namesFromNowhere,
  nameSpans,
  ownerNamesAmong,
  withoutLinesNaming,
} from '../strayContactNames';

const REPLY = [
  'ტრენერი გყავს: Levan Japaridze, ის სნოუბორდს ასწავლის.',
  '',
  'ჰკითხო Mariam Lomidze-ს, ვის ურჩევს?',
].join('\n');

describe('a reply names no own contact from nowhere', () => {
  beforeEach(() => mockQuery.mockReset());

  it('reads two- and three-word runs on one line, Latin ones only with capitals', () => {
    const spans = nameSpans('Ask Nino Beridze today.\nnino beridze\nნინო ბერიძე');
    expect(spans).toContain('nino beridze');
    expect(spans).toContain('ask nino beridze');
    expect(spans).toContain('ნინო ბერიძე');
    expect(nameSpans('the sales manager')).toEqual([]);
    expect(nameSpans('Nino\nBeridze')).toEqual([]);
  });

  it('asks the database only for the owner’s own saved names, with a timeout', async () => {
    mockQuery.mockResolvedValue({ rows: [{ alias: 'Mariam Lomidze' }] });
    const names = await ownerNamesAmong(7, ['mariam lomidze']);
    expect(names).toEqual(['Mariam Lomidze']);
    const [sql, params, timeout] = mockQuery.mock.calls[0] as [string, unknown[], number];
    expect(sql).toContain('"contactId" = $1');
    expect(sql).toContain('LIMIT');
    expect(params).toEqual([7, ['mariam lomidze']]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('asks nothing when the reply has no name-like run', async () => {
    expect(await ownerNamesAmong(7, [])).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('keeps a name the run read, and finds the one it never read', () => {
    const read = '{"results":[{"name":"Levan Japaridze","phone":"+995500000001"}]}';
    expect(namesFromNowhere(['Levan Japaridze', 'Mariam Lomidze'], read)).toEqual([
      'Mariam Lomidze',
    ]);
  });

  it('takes out only the line naming the person from nowhere', () => {
    expect(withoutLinesNaming(REPLY, ['Mariam Lomidze'])).toBe(
      'ტრენერი გყავს: Levan Japaridze, ის სნოუბორდს ასწავლის.',
    );
  });

  it('leaves the reply as written when nothing is stray, or nothing would be left', () => {
    expect(withoutLinesNaming(REPLY, [])).toBe(REPLY);
    const alone = 'ჰკითხო Mariam Lomidze-ს?';
    expect(withoutLinesNaming(alone, ['Mariam Lomidze'])).toBe(alone);
  });

  it('runs on every reply the owner reads, over the prompt and everything the run read', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('finalText = await withoutNamesFromNowhere(');
    expect(chat).toContain('`${promptBeforeTheRun}\\n${JSON.stringify(messages)}`');
  });
});
