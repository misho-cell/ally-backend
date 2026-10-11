jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../block.service', () => ({
  getExcludedPhoneSet: jest.fn(() => Promise.resolve(new Set())),
}));
jest.mock('../taskAsks.service', () => ({ sendApprovedAskAnswer: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { Namesake } from '../namesakeButtons';
import { noteNamesakes, ordinalPicked, shareInsteadOfShowing } from '../shareNumber.service';
import { sendApprovedAskAnswer } from '../taskAsks.service';

/**
 * 3466 (PR-011, 2 of 2): the helper has two „დათო გამოგონილი". After her pick
 * the number was printed in HER conversation and never reached the asker; and
 * „მეორე" gave the first one's number.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSend = sendApprovedAskAnswer as jest.MockedFunction<typeof sendApprovedAskAnswer>;
const THREAD = 45210;
const FIRST = '+441174960097';
const SECOND = '+441174960098';
const ALIAS: Record<string, string> = { [FIRST]: 'დათო გამოგონილი', [SECOND]: 'დათო გამოგონილი' };

/** Box 52934, run 1: the name search returned the other Dato first, the Saburtalo plumber second. */
const OTHER: Namesake = {
  phone: FIRST,
  name: 'დათო გამოგონილი',
  text: '{"name":"დათო გამოგონილი"}',
};
const SABURTALO: Namesake = {
  phone: SECOND,
  name: 'დათო გამოგონილი',
  text: '{"name":"დათო გამოგონილი","note":"საბურთალოს სანტექნიკი"}',
};
/** …and the buttons the helper saw put the Saburtalo plumber FIRST. */
const BUTTONS_SEEN = [
  'დათო გამოგონილი (საბურთალოს სანტექნიკი)',
  'დათო გამოგონილი (მეორე ჩანაწერი)',
  'სხვა, მე დავწერ',
];

function answerWith(lines: string[], buttons: readonly string[] = BUTTONS_SEEN): void {
  mockQuery.mockImplementation(((sql: string, params: unknown[]) => {
    if (sql.includes('FROM task_asks')) return Promise.resolve({ rows: [{ id: 1 }] });
    if (sql.includes('"UserAlias"'))
      return Promise.resolve({ rows: [{ alias: ALIAS[String(params[1])] }] });
    if (sql.includes('choices IS NOT NULL'))
      return Promise.resolve({ rows: buttons.length === 0 ? [] : [{ choices: buttons }] });
    if (sql.includes('FROM conversations'))
      return Promise.resolve({ rows: lines.map((content) => ({ content })) });
    return Promise.resolve({ rows: [] });
  }) as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSend.mockResolvedValue({ sent: true } as never);
  noteNamesakes(THREAD, [OTHER, SABURTALO]);
});

describe('an ordinal pick', () => {
  it('reads the position', () => {
    expect(ordinalPicked('მეორე')).toBe(1);
    expect(ordinalPicked('პირველი')).toBe(0);
    expect(ordinalPicked('the second')).toBe(1);
    expect(ordinalPicked('მეორე დათო გამოგონილი')).toBeNull();
  });
});

describe('the number the helper picked goes to the asker', () => {
  // Box 52934 run 1: „მეორე" is the second BUTTON — not the search's second row, the plumber.
  it('„მეორე" sends the person on the second button, whatever the search order or the run chose', async () => {
    answerWith(['მეორე', 'მიეცი დათო გამოგონილის ნომერი ჩემი წიგნიდან.']);
    const outcome = await shareInsteadOfShowing('180279', THREAD, SECOND);
    expect(outcome).toEqual({ shared: true, name: 'დათო გამოგონილი' });
    expect(mockSend.mock.calls[0][2]).toContain(FIRST);
    expect(mockSend.mock.calls[0][2]).not.toContain(SECOND);
  });

  it('„პირველი" sends the person the first button names', async () => {
    answerWith(['პირველი', 'მიეცი დათო გამოგონილის ნომერი ჩემი წიგნიდან.']);
    await shareInsteadOfShowing('180279', THREAD, FIRST);
    expect(mockSend.mock.calls[0][2]).toContain(SECOND);
  });

  it('with no buttons to read, the phone the run chose stands — never the search order', async () => {
    answerWith(['მეორე', 'მიეცი დათო გამოგონილის ნომერი ჩემი წიგნიდან.'], []);
    await shareInsteadOfShowing('180279', THREAD, FIRST);
    expect(mockSend.mock.calls[0][2]).toContain(FIRST);
  });

  it('a tapped label sends the phone the run chose', async () => {
    answerWith(['მეორე დათო გამოგონილი', 'მიეცი დათო გამოგონილის ნომერი ჩემი წიგნიდან.']);
    await shareInsteadOfShowing('180279', THREAD, SECOND);
    expect(mockSend.mock.calls[0][2]).toContain(SECOND);
  });

  it('nothing is shared when her words never asked to give a number', async () => {
    answerWith(['რა ნომერი აქვს დათოს?']);
    expect(await shareInsteadOfShowing('180279', THREAD, FIRST)).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('get_own_contact_number on a question’s thread shares instead of showing', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const at = chat.indexOf("case 'get_own_contact_number': {");
    expect(chat.slice(at, at + 600)).toContain('await shareInsteadOfShowing(');
    expect(chat).toContain(
      'if (threadId !== undefined) noteNamesakes(threadId, namesakesIn(byName));',
    );
  });
});
