jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../contactFacts.service', () => ({
  __esModule: true,
  submitContactFact: jest.fn().mockResolvedValue({ is_public: false, canonical_value: null }),
}));

import { query } from '../../db/postgres/client';
import { submitContactFact } from '../contactFacts.service';
import {
  parsePhonebookLabelsForUser,
  getLabelQueueForUser,
  getLabelQueueTotal,
} from '../labelParser.service';

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
    expect(mockSubmitFact).toHaveBeenCalledWith(
      '7',
      '+995500000001',
      'occupation',
      'სანტექნიკოსი',
      'label',
      null,
    );
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

  it('a plain two-word name is neither parsed nor queued — live-caught: threshold of 2 queued 84% of a real phonebook, almost all of it just "First Last"', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM "UserAlias" ua'))
        return Promise.resolve(
          rows([{ contactId: 7, phone: '+995500000006', alias: 'Gia Kublashvili' }]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });

    const out = await parsePhonebookLabelsForUser('7');

    expect(out).toEqual({ parsed: 0, queued: 0 });
    expect(mockSubmitFact).not.toHaveBeenCalled();
  });

  it('a real 3-word unresolved trade still queues (the one genuine positive from that same phonebook)', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM "UserAlias" ua'))
        return Promise.resolve(
          rows([
            {
              contactId: 7,
              phone: '+995500000007',
              alias: 'Zviad Elizbarashvili Arkitektura',
            },
          ]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });

    const out = await parsePhonebookLabelsForUser('7');

    expect(out).toEqual({ parsed: 0, queued: 1 });
  });

  it('emoji decoration does not count as words — a name plus emoji is not queued', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM "UserAlias" ua'))
        return Promise.resolve(
          rows([{ contactId: 7, phone: '+995500000008', alias: 'ლილუ 🐼😊' }]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });

    const out = await parsePhonebookLabelsForUser('7');

    expect(out).toEqual({ parsed: 0, queued: 0 });
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

  it('a Latin-typed spelling of a Georgian trade word matches too (buildSearchTerms variants)', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM "UserAlias" ua'))
        return Promise.resolve(
          rows([{ contactId: 7, phone: '+995500000005', alias: 'Zura Santeknikosi' }]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });

    const out = await parsePhonebookLabelsForUser('7');

    expect(out).toEqual({ parsed: 1, queued: 0 });
    expect(mockSubmitFact).toHaveBeenCalledWith(
      '7',
      '+995500000005',
      'occupation',
      'სანტექნიკოსი',
      'label',
      null,
    );
  });

  it('the specific trade wins over the generic "ხელოსანი" when a label carries both — live-caught: whichever word came first used to win regardless of specificity', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM "UserAlias" ua'))
        return Promise.resolve(
          rows([
            { contactId: 7, phone: '+995500000009', alias: 'Vano Xelosani Eleqtrikosi' },
          ]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });

    const out = await parsePhonebookLabelsForUser('7');

    expect(out).toEqual({ parsed: 1, queued: 0 });
    expect(mockSubmitFact).toHaveBeenCalledWith(
      '7',
      '+995500000009',
      'occupation',
      'ელექტრიკოსი',
      'label',
      null,
    );
  });

  it('the generic "ხელოსანი" is still stored on its own, when nothing more specific is in the label', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM "UserAlias" ua'))
        return Promise.resolve(
          rows([{ contactId: 7, phone: '+995500000010', alias: 'Vano Xelosani' }]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });

    const out = await parsePhonebookLabelsForUser('7');

    expect(out).toEqual({ parsed: 1, queued: 0 });
    expect(mockSubmitFact).toHaveBeenCalledWith(
      '7',
      '+995500000010',
      'occupation',
      'ხელოსანი',
      'label',
      null,
    );
  });

  it('the mixed q/k spelling "Eleqtriki" matches — live-caught: buildSearchTerms\' global drift swap can only produce all-q or all-k, never the mixed form people actually type', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM "UserAlias" ua'))
        return Promise.resolve(
          rows([{ contactId: 7, phone: '+995500000011', alias: 'Gia Eleqtriki' }]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });

    const out = await parsePhonebookLabelsForUser('7');

    expect(out).toEqual({ parsed: 1, queued: 0 });
    expect(mockSubmitFact).toHaveBeenCalledWith(
      '7',
      '+995500000011',
      'occupation',
      'ელექტრიკი',
      'label',
      null,
    );
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
    expect(mockSubmitFact).toHaveBeenCalledWith(
      '7',
      '+995500000004',
      'occupation',
      'Plumber',
      'label',
      null,
    );
  });
});

describe('getLabelQueueForUser', () => {
  it("scopes to the caller's own queue and returns raw phone + alias (the in-app shape)", async () => {
    mockQuery.mockResolvedValue(
      rows([{ phone: '+995500111333', alias: 'Nika Besos Dzma' }]) as never,
    );

    const out = await getLabelQueueForUser('170751', 20);

    expect(out).toEqual([{ phone: '+995500111333', alias: 'Nika Besos Dzma' }]);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('contact_id = $1::int');
    expect(params).toEqual(['170751', 20]);
  });
});

describe('getLabelQueueTotal', () => {
  it("returns the real total, not a page's length — live-caught: the admin route was reporting 2 when the queue held 2,277", async () => {
    mockQuery.mockResolvedValue(rows([{ count: '2277' }]) as never);

    const out = await getLabelQueueTotal();

    expect(out).toBe(2277);
  });
});
