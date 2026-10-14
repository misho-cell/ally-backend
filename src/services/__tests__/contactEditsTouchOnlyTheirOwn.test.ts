jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import {
  correctOwnFact,
  EditOutcome,
  forgetOwnFact,
  removeOwnExclusion,
} from '../contactEdits.service';
import { peopleSettings, removeOwnBoundary } from '../peopleSettings.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => mockQuery.mockReset());

/** The frontend's 14 Oct 14:10Z items 1 and 2: every write is by id and only the person's own. */
describe('the contact page’s writes', () => {
  it('corrects a fact only when it is this person’s, on this contact', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 } as never);
    await expect(correctOwnFact(171, '+995 500 000 001', 7, ' plays go ')).resolves.toBe(
      EditOutcome.Done,
    );
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('submitted_by_user_id = $2 AND neo4j_contact_id = $3');
    expect(params).toEqual([7, '171', expect.any(String), 'plays go']);
  });

  it('says not found when nothing of theirs matched', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 } as never);
    await expect(forgetOwnFact(171, '+995500000001', 8)).resolves.toBe(EditOutcome.NotFound);
    mockQuery.mockResolvedValueOnce({ rowCount: 0 } as never);
    await expect(removeOwnExclusion(171, '+995500000001', 3)).resolves.toBe(EditOutcome.NotFound);
  });
});

describe('people settings', () => {
  it('reads exclusions with a contact id and boundaries by topic, each with an id', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 3,
            contact_phone: '995500000001',
            alias: 'Gela',
            excluded_for: 'plumber',
            reason: null,
          },
        ],
      } as never)
      .mockResolvedValueOnce({
        rows: [{ id: 11, topic: 'electricians', terms: ['electrician'] }],
      } as never);

    const settings = await peopleSettings(171);
    expect(settings.exclusions).toEqual([
      {
        id: 3,
        contact_id: expect.stringMatching(/^c_/),
        name: 'Gela',
        excluded_for: 'plumber',
        reason: null,
      },
    ]);
    expect(settings.boundaries).toEqual([
      { id: 11, topic: 'electricians', terms: ['electrician'] },
    ]);
  });

  it('takes a whole topic back, only among the person’s own rows', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 2 } as never);
    await expect(removeOwnBoundary(171, 11)).resolves.toBe(true);
    expect(String(mockQuery.mock.calls[0][0])).toContain('WHERE id = $2 AND user_id = $1::int');
  });
});
