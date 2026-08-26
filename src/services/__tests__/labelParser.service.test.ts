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
  reprocessLabelQueue,
  reprocessSavedOccupationFacts,
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

describe('reprocessLabelQueue (engine T2 catch-up pass)', () => {
  it('promotes a queued row to a real fact when today\'s dictionary now resolves it, and removes it from the queue — live-caught: the "Eleqtriki" fix never reached rows queued before it shipped', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM label_parse_queue'))
        return Promise.resolve(
          rows([
            { id: 9, contact_id: 501, phone: '+995500000012', alias: 'Gia Eleqtriki' },
          ]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });

    const out = await reprocessLabelQueue();

    expect(out).toEqual({ promoted: 1, removed: 0, remaining: 0 });
    expect(mockSubmitFact).toHaveBeenCalledWith(
      '501',
      '+995500000012',
      'occupation',
      'ელექტრიკი',
      'label',
      null,
    );
    const del = mockQuery.mock.calls.find(([sql]) => (sql as string).includes('DELETE'));
    expect(del?.[1]).toEqual([9]);
  });

  it('removes a plain-name row that today\'s stricter word-count rule would never have queued — live-caught: 2,277 of one real account\'s 2,698 contacts were just "First Last"', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM label_parse_queue'))
        return Promise.resolve(
          rows([
            { id: 10, contact_id: 501, phone: '+995500000013', alias: 'Gia Kublashvili' },
          ]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });

    const out = await reprocessLabelQueue();

    expect(out).toEqual({ promoted: 0, removed: 1, remaining: 0 });
    expect(mockSubmitFact).not.toHaveBeenCalled();
    const del = mockQuery.mock.calls.find(([sql]) => (sql as string).includes('DELETE'));
    expect(del?.[1]).toEqual([10]);
  });

  it('leaves a genuine, still-unresolved label untouched', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM label_parse_queue'))
        return Promise.resolve(
          rows([
            { id: 11, contact_id: 501, phone: '+995500000014', alias: 'Nika Besos Dzma' },
          ]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });

    const out = await reprocessLabelQueue();

    expect(out).toEqual({ promoted: 0, removed: 0, remaining: 1 });
    expect(mockSubmitFact).not.toHaveBeenCalled();
    expect(mockQuery.mock.calls.some(([sql]) => (sql as string).includes('DELETE'))).toBe(false);
  });

  it('scopes to one account when userId is given, and sweeps the whole queue otherwise', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await reprocessLabelQueue('501');
    let call = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('FROM label_parse_queue'),
    );
    expect(call?.[0]).toContain('WHERE contact_id');
    expect(call?.[1]).toEqual(['501']);

    jest.clearAllMocks();
    mockQuery.mockResolvedValue(rows([]) as never);
    await reprocessLabelQueue();
    call = mockQuery.mock.calls.find(([sql]) => (sql as string).includes('FROM label_parse_queue'));
    expect(call?.[0]).not.toContain('WHERE contact_id');
    expect(call?.[1]).toEqual([]);
  });
});

describe('reprocessSavedOccupationFacts — revisits already-saved facts, not just the queue (explicitly asked for on the old list too)', () => {
  it("upgrades a fact when re-matching the ORIGINAL label against today's logic gives a different, more specific answer", async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('JOIN "UserAlias"')) {
        return Promise.resolve(
          rows([
            {
              id: 1,
              submitted_by_user_id: '7',
              neo4j_contact_id: '+995500000009',
              value: 'ხელოსანი',
              alias: 'Vano Xelosani Eleqtrikosi',
            },
          ]) as never,
        );
      }
      return Promise.resolve(rows([]) as never);
    });

    const out = await reprocessSavedOccupationFacts();

    expect(out).toEqual({ upgraded: 1, unchanged: 0 });
    expect(mockSubmitFact).toHaveBeenCalledWith(
      '7',
      '+995500000009',
      'occupation',
      'ელექტრიკოსი',
      'label',
      null,
    );
  });

  it('leaves a fact untouched when re-matching agrees with what is already saved', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('JOIN "UserAlias"')) {
        return Promise.resolve(
          rows([
            {
              id: 2,
              submitted_by_user_id: '7',
              neo4j_contact_id: '+995500000010',
              value: 'ექიმი',
              alias: 'Nino Eqimi',
            },
          ]) as never,
        );
      }
      return Promise.resolve(rows([]) as never);
    });

    const out = await reprocessSavedOccupationFacts();

    expect(out).toEqual({ upgraded: 0, unchanged: 1 });
    expect(mockSubmitFact).not.toHaveBeenCalled();
  });

  it('leaves a fact untouched when the label no longer matches anything (never downgrades to null)', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('JOIN "UserAlias"')) {
        return Promise.resolve(
          rows([
            {
              id: 3,
              submitted_by_user_id: '7',
              neo4j_contact_id: '+995500000011',
              value: 'ხელოსანი',
              alias: 'Gia Random Name',
            },
          ]) as never,
        );
      }
      return Promise.resolve(rows([]) as never);
    });

    const out = await reprocessSavedOccupationFacts();

    expect(out).toEqual({ upgraded: 0, unchanged: 1 });
    expect(mockSubmitFact).not.toHaveBeenCalled();
  });

  it('scopes to label-sourced occupation facts only, via a WHERE clause in the same query', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await reprocessSavedOccupationFacts();

    const call = mockQuery.mock.calls.find(([sql]) => (sql as string).includes('JOIN "UserAlias"'));
    const sql = call?.[0] as string;
    expect(sql).toContain("field_type = 'occupation'");
    expect(sql).toContain("source = 'label'");
    expect(sql).toContain('retracted_at IS NULL');
  });
});
