jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../contactFacts.service', () => ({
  __esModule: true,
  FACT_FIELD_TYPES: ['occupation', 'employer', 'city', 'industry'],
  moderateNotePublicity: jest.fn(),
  runSemanticMatching: jest.fn(),
  trustedFactCuratorIds: jest.fn(),
}));

import { query } from '../../db/postgres/client';
import {
  moderateNotePublicity,
  runSemanticMatching,
  trustedFactCuratorIds,
} from '../contactFacts.service';
import { republishFacts } from '../factRepublish.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockModerate = moderateNotePublicity as jest.MockedFunction<typeof moderateNotePublicity>;
const mockMatch = runSemanticMatching as jest.MockedFunction<typeof runSemanticMatching>;
const mockCurators = trustedFactCuratorIds as jest.MockedFunction<typeof trustedFactCuratorIds>;

function rows(data: unknown[], rowCount = data.length): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCurators.mockReturnValue([]);
  mockQuery.mockResolvedValue(rows([]) as never);
  mockMatch.mockResolvedValue({ canonical: null, matching_indices: [] });
});

describe('republishFacts — the repair pass over facts the fenced-JSON bug left private', () => {
  it("publishes a curator's core facts with their own value as canonical, no model call", async () => {
    mockCurators.mockReturnValue(['501']);
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('canonical_value = value') && sql.includes('submitted_by_user_id = ANY'))
        return Promise.resolve(rows([], 426) as never);
      return Promise.resolve(rows([]) as never);
    });

    const out = await republishFacts(40);

    expect(out.curator_core_published).toBe(426);
    const update = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('submitted_by_user_id = ANY'),
    );
    // Scoped to the curator, to core fields, and only to rows still private.
    expect(update?.[1]?.[0]).toEqual(['501']);
    expect(update?.[0] as string).toContain('is_public = false');
    expect(mockModerate).not.toHaveBeenCalled();
  });

  it('touches nothing when no curator is configured — the exception is opt-in', async () => {
    await republishFacts(40);

    const update = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('submitted_by_user_id = ANY'),
    );
    expect(update).toBeUndefined();
  });

  it('re-moderates private free-form facts and publishes only the yes verdicts', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('field_type <> ALL'))
        return Promise.resolve(
          rows([
            { id: 1, field_type: 'education', value: 'Harvard MBA' },
            { id: 2, field_type: 'note', value: 'ძალიან ახლო მეგობარი' },
          ]) as never,
        );
      if (sql.includes('WHERE id = ANY')) return Promise.resolve(rows([], 1) as never);
      return Promise.resolve(rows([]) as never);
    });
    mockModerate.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const out = await republishFacts(40);

    expect(out).toMatchObject({ free_form_checked: 2, free_form_published: 1 });
    const publish = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('WHERE id = ANY'),
    );
    // Only the professional one; the relationship note stays private.
    expect(publish?.[1]?.[0]).toEqual([1]);
  });

  it('re-runs crowd confirmation for a group with two submitters and publishes the matches', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('COUNT(DISTINCT submitted_by_user_id) >= 2'))
        return Promise.resolve(
          rows([{ neo4j_contact_id: '+995555000005', field_type: 'occupation' }]) as never,
        );
      if (sql.includes('WHERE neo4j_contact_id = $1 AND field_type = $2'))
        return Promise.resolve(
          rows([
            { id: 11, field_type: 'occupation', value: 'იურისტი' },
            { id: 12, field_type: 'occupation', value: 'ადვოკატი' },
            { id: 13, field_type: 'occupation', value: 'ფოტოგრაფი' },
          ]) as never,
        );
      if (sql.includes('canonical_value = $1')) return Promise.resolve(rows([], 2) as never);
      return Promise.resolve(rows([]) as never);
    });
    mockMatch.mockResolvedValue({ canonical: 'ადვოკატი', matching_indices: [0, 1] });

    const out = await republishFacts(40);

    expect(out).toMatchObject({ core_groups_checked: 1, core_facts_published: 2 });
    const publish = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('canonical_value = $1'),
    );
    // The matched pair only — the third value keeps its own private row.
    expect(publish?.[1]).toEqual(['ადვოკატი', [11, 12]]);
  });

  it('publishes nothing for a group the matcher cannot agree on', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('COUNT(DISTINCT submitted_by_user_id) >= 2'))
        return Promise.resolve(
          rows([{ neo4j_contact_id: '+995555000009', field_type: 'city' }]) as never,
        );
      if (sql.includes('WHERE neo4j_contact_id = $1 AND field_type = $2'))
        return Promise.resolve(
          rows([
            { id: 21, field_type: 'city', value: 'თბილისი' },
            { id: 22, field_type: 'city', value: 'ბერლინი' },
          ]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });
    mockMatch.mockResolvedValue({ canonical: null, matching_indices: [] });

    const out = await republishFacts(40);

    expect(out.core_facts_published).toBe(0);
  });
});
