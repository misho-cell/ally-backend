jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { frameServerTurn, openingKeptAsServerTurn } from '../chat.service';

const OPENER =
  'ლია კერესელიძე დაუკავშირდა ირო ენჯელ კლუბს და სთხოვა შენთან დაკავშირებაში შუამდგომლობა გაეწია.';

/** #7238 (audit, 63384): the line a server-opened conversation starts with reaches the model. */
describe('a conversation the server opened', () => {
  it('keeps its opening line as a server turn before the reader’s answer', () => {
    const rows = openingKeptAsServerTurn([
      { role: 'assistant', content: OPENER },
      { role: 'user', content: 'ჰმ. პრობლემა არ არის. დამაკავშირე' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('user');
    const blocks = rows[0].content as { type: string; text: string }[];
    const text = blocks.map((b) => b.text).join('\n');
    expect(text).toContain(frameServerTurn(OPENER) as string);
    expect(text).toContain('დამაკავშირე');
  });

  it('leaves a conversation that starts with the user as it is', () => {
    const rows = [
      { role: 'user' as const, content: 'გამარჯობა' },
      { role: 'assistant' as const, content: 'გისმენ' },
    ];
    expect(openingKeptAsServerTurn(rows)).toBe(rows);
  });

  it('does not keep an opening that is a tool call', () => {
    const rows = [
      {
        role: 'assistant' as const,
        content: [{ type: 'tool_use' as const, id: 't1', name: 'web_search', input: {} }],
      },
    ];
    expect(openingKeptAsServerTurn(rows)).toBe(rows);
  });
});
