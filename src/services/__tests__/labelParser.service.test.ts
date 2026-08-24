jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../contactFacts.service', () => ({
  __esModule: true,
  submitContactFact: jest.fn().mockResolvedValue({ is_public: false, canonical_value: null }),
}));

import { query } from '../../db/postgres/client';
import { submitContactFact } from '../contactFacts.service';
import { parsePhonebookLabelsForUser } from '../labelParser.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSubmitFact = submitContactFact as jest.MockedFunction<typeof submitContactFact>;

function rows(data: unknown[], rowCount = data.length): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('parsePhonebookLabelsForUser (engine T2)', () => {
  it("a recognized trade word becomes a real occupation fact — the founder's own example", async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM "UserAlias" ua'))
        return Promise.resolve(
          rows([{ contactId: 7, phone: '+995500000001', alias: 'ზურა სანტექნიკოსი' }]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });

    const out = await parsePhonebookLabelsForUser('7');

    expect(out).toEqual({ parsed: 1, queued: 0 });
    expect(mockSubmitFact).toHaveBeenCalledWith('7', '+995500000001', 'occupation', 'სანტექნიკოსი');
  });

  it('an unrecognized multi-word label is queued, not dropped', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM "UserAlias" ua'))
        return Promise.resolve(
          rows([{ contactId: 7, phone: '+995500000002', alias: 'Nika Besos Dzma' }]) as never,
        );
      if (sql.includes('INSERT INTO label_parse_queue')) return Promise.resolve(rows([]) as never);
      return Promise.resolve(rows([]) as never);
    });

    const out = await parsePhonebookLabelsForUser('7');

    expect(out).toEqual({ parsed: 0, queued: 1 });
    expect(mockSubmitFact).not.toHaveBeenCalled();
    const insert = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('INSERT INTO label_parse_queue'),
    );
    expect(insert?.[1]).toEqual([7, '+995500000002', 'Nika Besos Dzma']);
  });

  it('a bare one-word label (a plain name) is neither parsed nor queued', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM "UserAlias" ua'))
        return Promise.resolve(
          rows([{ contactId: 7, phone: '+995500000003', alias: 'გია' }]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });

    const out = await parsePhonebookLabelsForUser('7');

    expect(out).toEqual({ parsed: 0, queued: 0 });
    expect(mockSubmitFact).not.toHaveBeenCalled();
    expect(
      mockQuery.mock.calls.some(([sql]) =>
        (sql as string).includes('INSERT INTO label_parse_queue'),
      ),
    ).toBe(false);
  });

  it('already-processed and already-queued phones are excluded by the candidate query itself', async () => {
    mockQuery.mockImplementation((sql: string) => {
      expect(sql).toContain('NOT EXISTS');
      expect(sql).toContain("field_type = 'occupation'");
      expect(sql).toContain('label_parse_queue q');
      return Promise.resolve(rows([]) as never);
    });

    const out = await parsePhonebookLabelsForUser('7');

    expect(out).toEqual({ parsed: 0, queued: 0 });
  });

  it('an English trade word matches too, case-insensitively', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM "UserAlias" ua'))
        return Promise.resolve(
          rows([{ contactId: 7, phone: '+995500000004', alias: 'John Plumber' }]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });

    const out = await parsePhonebookLabelsForUser('7');

    expect(out).toEqual({ parsed: 1, queued: 0 });
    expect(mockSubmitFact).toHaveBeenCalledWith('7', '+995500000004', 'occupation', 'Plumber');
  });
});
