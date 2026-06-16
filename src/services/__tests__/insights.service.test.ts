jest.mock('../../db/postgres/client', () => ({
  query: jest.fn(),
  __esModule: true,
}));

import { query } from '../../db/postgres/client';
import {
  getInsightFields,
  getAllInsightFields,
  getContactInsight,
  saveContactInsight,
  getInsightsByUser,
  createInsightField,
  updateInsightField,
  toggleInsightField,
} from '../insights.service';
import { InsightField, ContactInsight } from '../../types';

const mockQuery = query as jest.MockedFunction<typeof query>;

const mockField: InsightField = {
  id: 'field-uuid-1',
  fieldKey: 'mood',
  fieldLabel: 'Mood',
  fieldDescription: 'Contact mood',
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
};

const mockInsight: ContactInsight = {
  id: 'insight-uuid-1',
  userId: 'user-uuid-1',
  neo4jContactId: 'contact-node-1',
  neo4jContactName: 'გიორგი',
  data: { mood: 'happy' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getInsightFields', () => {
  it('returns active fields', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [mockField], rowCount: 1 } as never);

    const result = await getInsightFields();

    expect(result).toEqual([mockField]);
    expect(mockQuery.mock.calls[0][0]).toContain('is_active = true');
  });

  it('returns empty array when no active fields', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    const result = await getInsightFields();

    expect(result).toEqual([]);
  });
});

describe('getAllInsightFields', () => {
  it('returns all fields regardless of active status', async () => {
    const inactiveField = { ...mockField, isActive: false };
    mockQuery.mockResolvedValueOnce({ rows: [mockField, inactiveField], rowCount: 2 } as never);

    const result = await getAllInsightFields();

    expect(result).toHaveLength(2);
    expect(mockQuery.mock.calls[0][0]).not.toContain('WHERE is_active');
  });
});

describe('getContactInsight', () => {
  it('returns insight when found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [mockInsight], rowCount: 1 } as never);

    const result = await getContactInsight('user-uuid-1', 'contact-node-1');

    expect(result).toEqual(mockInsight);
  });

  it('returns null when not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    const result = await getContactInsight('user-uuid-1', 'missing-node');

    expect(result).toBeNull();
  });
});

describe('saveContactInsight', () => {
  it('upserts and returns the saved insight', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [mockInsight], rowCount: 1 } as never);

    const result = await saveContactInsight('user-uuid-1', 'contact-node-1', 'გიორგი', {
      mood: 'happy',
    });

    expect(result).toEqual(mockInsight);
    expect(mockQuery.mock.calls[0][0]).toContain('ON CONFLICT');
  });

  it('throws when DB returns no rows', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    await expect(saveContactInsight('user-uuid-1', 'contact-node-1', 'გიორგი', {})).rejects.toThrow(
      'Unable to save contact insight',
    );
  });
});

describe('getInsightsByUser', () => {
  it('combines insights with field context', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [mockInsight], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [mockField], rowCount: 1 } as never);

    const result = await getInsightsByUser('user-uuid-1');

    expect(result).toHaveLength(1);
    expect(result[0].fieldContext).toEqual([mockField]);
    expect(result[0].data).toEqual(mockInsight.data);
  });

  it('returns empty array when user has no insights', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    const result = await getInsightsByUser('user-uuid-1');

    expect(result).toEqual([]);
  });
});

describe('createInsightField', () => {
  it('inserts and returns new field', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [mockField], rowCount: 1 } as never);

    const result = await createInsightField('mood', 'Mood', 'Contact mood');

    expect(result).toEqual(mockField);
    expect(mockQuery.mock.calls[0][1]).toEqual(['mood', 'Mood', 'Contact mood']);
  });
});

describe('updateInsightField', () => {
  it('updates and returns the field', async () => {
    const updated = { ...mockField, fieldLabel: 'Updated' };
    mockQuery.mockResolvedValueOnce({ rows: [updated], rowCount: 1 } as never);

    const result = await updateInsightField('field-uuid-1', 'Updated', 'New description');

    expect(result.fieldLabel).toBe('Updated');
  });

  it('throws when field not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    await expect(updateInsightField('missing-id', 'Label', 'Desc')).rejects.toThrow(
      'Insight field not found',
    );
  });
});

describe('toggleInsightField', () => {
  it('toggles active status and returns field', async () => {
    const toggled = { ...mockField, isActive: false };
    mockQuery.mockResolvedValueOnce({ rows: [toggled], rowCount: 1 } as never);

    const result = await toggleInsightField('field-uuid-1');

    expect(result.isActive).toBe(false);
    expect(mockQuery.mock.calls[0][0]).toContain('NOT is_active');
  });

  it('throws when field not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    await expect(toggleInsightField('missing-id')).rejects.toThrow('Insight field not found');
  });
});
