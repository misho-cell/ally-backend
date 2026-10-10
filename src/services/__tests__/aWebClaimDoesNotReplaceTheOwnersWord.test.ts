jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { submitContactFact } from '../contactFacts.service';
import { relaysHearsay } from '../hearsay';

const mockQuery = query as jest.MockedFunction<typeof query>;

/** 3235's second half (ME-023): a web claim the owner only reported replaced their stated employer. */
describe('a line that only relays the web or others', () => {
  it.each([
    'ინტერნეტში წერია, რომ ბახვა „სანიმუშო ბანკში" მუშაობს',
    'ლინკდინზე ეწერა, რომ ნინო TBC-შია',
    'ამბობენ, რომ გია ახლა ბათუმშია',
    'I read online that Levan works at Colliers',
    'Говорят, что он работает в банке',
  ])('„%s" is hearsay', (line) => {
    expect(relaysHearsay(line)).toBe(true);
  });

  it.each(['ბახვა „სანიმუშო ბანკში" მუშაობს', 'Levan works at Colliers'])(
    '„%s" is the owner’s own word',
    (line) => {
      expect(relaysHearsay(line)).toBe(false);
    },
  );

  it('makes save_contact_fact save as mentioned', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('relaysHearsay(runId === undefined');
  });
});

describe('a mentioned value over the owner’s stated one', () => {
  beforeEach(() => mockQuery.mockReset());

  it('is kept as a note beside it, and the stated row is not touched', async () => {
    mockQuery.mockImplementation(((sql: string) =>
      Promise.resolve(sql.includes('COUNT(*)') ? { rows: [{ n: 1 }] } : { rows: [] })) as never);
    const saved = await submitContactFact(
      '171',
      '+995599000001',
      'employer',
      'სანიმუშო ბანკი',
      'chat',
      'mentioned',
    );
    expect(saved).toEqual({ is_public: false, canonical_value: null });
    const sqls = mockQuery.mock.calls.map(([sql]) => String(sql));
    expect(
      sqls.some((sql) =>
        sql.includes('ON CONFLICT (neo4j_contact_id, submitted_by_user_id, field_type)'),
      ),
    ).toBe(false);
    const insert = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO contact_facts'),
    );
    expect(insert?.[1]).toEqual(expect.arrayContaining(['note', 'employer: სანიმუშო ბანკი']));
  });
});
