jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../contactFacts.service', () => ({
  FACT_FIELD_TYPES: ['occupation', 'employer', 'city', 'industry'],
  submitContactFact: jest.fn(() => Promise.resolve({ is_public: false, canonical_value: null })),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { submitContactFact } from '../contactFacts.service';
import { answerConfirm, confirmCardFor, confirmTapOf, ConfirmTap } from '../factConfirm.service';
import { renderPendingMessage } from '../pendingMessages';

/** 1690 (A7): an old core fact is confirmed with the owner at the moment it is used. */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSubmit = submitContactFact as jest.MockedFunction<typeof submitContactFact>;
const ka = (): Promise<'ka'> => Promise.resolve('ka');
const FACT = {
  id: 41,
  phone: '+447700900301',
  field_type: 'employer',
  value: 'BDO',
  name: 'ზურაბ ტესტური',
};

function route(handlers: Record<string, unknown[]>): void {
  mockQuery.mockImplementation(((sql: string) => {
    for (const [needle, rows] of Object.entries(handlers)) {
      if (sql.includes(needle)) return Promise.resolve({ rows, rowCount: rows.length });
    }
    return Promise.resolve({ rows: [], rowCount: 1 });
  }) as never);
}

beforeEach(() => jest.clearAllMocks());

describe('the card', () => {
  it('a fact saved seven months ago gives one confirm line, recorded as asked', async () => {
    route({
      'SELECT EXISTS (SELECT 1 FROM fact_confirms': [{ asked: false }],
      'FROM contact_facts cf': [FACT],
    });
    const card = await confirmCardFor('180300', 45001, [FACT.phone], 'ka');
    expect(card).toEqual({
      text: 'შენახული მაქვს: ზურაბ ტესტური — „BDO". ისევ ასეა?',
      choices: ['კი, ასეა', 'აღარ', 'არ ვიცი'],
    });
    const sqls = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes('SET confirm_asked_at = NOW()'))).toBe(true);
    const staleSql = sqls.find((s) => s.includes('FROM contact_facts cf')) ?? '';
    expect(staleSql).toContain('cf.created_at < NOW() - make_interval(days => $4)');
    expect(staleSql).toContain(
      'cf.last_confirmed_at IS NULL AND cf.confirmed_by_result_at IS NULL',
    );
  });

  it('a second old fact in the same conversation gives no second question', async () => {
    route({ 'SELECT EXISTS (SELECT 1 FROM fact_confirms': [{ asked: true }] });
    expect(await confirmCardFor('180300', 45001, [FACT.phone], 'ka')).toBeNull();
  });

  it('a fact younger than 180 days triggers nothing', async () => {
    route({
      'SELECT EXISTS (SELECT 1 FROM fact_confirms': [{ asked: false }],
      'FROM contact_facts cf': [],
    });
    expect(await confirmCardFor('180300', 45001, [FACT.phone], 'ka')).toBeNull();
  });

  it('is drawn by the server with its own buttons', () => {
    const out = renderPendingMessage(
      {
        kind: 'fact_confirm',
        task_id: null,
        payload: { text: 'x?', choices: ['კი, ასეა', 'აღარ'] },
      },
      'ka',
    );
    expect(out?.choices).toEqual(['კი, ასეა', 'აღარ']);
  });
});

describe('the taps', () => {
  const open = (state: string): Record<string, unknown[]> => ({
    'FROM fact_confirms\n': [
      { id: 9, fact_id: 41, phone: FACT.phone, field_type: 'employer', name: FACT.name, state },
    ],
  });

  it('knows the buttons in either language', () => {
    expect(confirmTapOf('კი, ასეა')).toBe(ConfirmTap.Yes);
    expect(confirmTapOf('No longer')).toBe(ConfirmTap.No);
    expect(confirmTapOf('ბოდიში, სხვა რამე')).toBeNull();
  });

  it('„yes" sets last_confirmed_at', async () => {
    route(open('asked'));
    expect(await answerConfirm('180300', 45001, 'კი, ასეა', ka)).toBe('კარგი, ასე დავტოვებ.');
    expect(
      mockQuery.mock.calls.some((c) => String(c[0]).includes('SET last_confirmed_at = NOW()')),
    ).toBe(true);
  });

  it('„no longer" asks where now, and the next short line is saved as a new fact', async () => {
    route(open('asked'));
    expect(await answerConfirm('180300', 45001, 'აღარ', ka)).toBe(
      'ახლა სად მუშაობს ზურაბ ტესტური?',
    );
    route(open('no_waiting'));
    expect(await answerConfirm('180300', 45001, 'Deloitte', ka)).toBe(
      'დავიმახსოვრე: ზურაბ ტესტური — „Deloitte".',
    );
    expect(mockSubmit).toHaveBeenCalledWith(
      '180300',
      FACT.phone,
      'employer',
      'Deloitte',
      'chat',
      'stated',
    );
  });

  it('a line that is not a tap goes to the run as always', async () => {
    route(open('asked'));
    expect(await answerConfirm('180300', 45001, 'მჭირდება სანტექნიკოსი', ka)).toBeNull();
  });

  it('the run asks once after a search, and the tap is answered before any model', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('noteSearchedPhones(runId, phonesIn(labelled));');
    expect(chat).toContain(
      'await confirmCardFor(userId, threadId, searchedPhones, runLang(runId))',
    );
    expect(chat).toContain('await answerFactConfirm(userId, threadId, userMessage, runId, intent)');
    const debrief = readFileSync(join(__dirname, '..', 'debrief.service.ts'), 'utf8');
    expect(debrief).toContain('await confirmByResult(askerId, helper);');
  });
});
