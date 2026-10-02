/**
 * The tester's 1004 (goal 4324): two wakes three days apart sent the owner the
 * same sentence word for word. The wake is now told what the owner last read.
 */
jest.mock('../../db/postgres/client', () => ({
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  query: jest.fn(),
  __esModule: true,
}));

import { query } from '../../db/postgres/client';
import { doNotRepeatNote, lastAssistantMessage } from '../lastReplyNote';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => mockQuery.mockReset());

describe('lastAssistantMessage', () => {
  it('reads the last message the owner read in the thread', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ content: '  nothing new yet.  ' }] } as never);

    expect(await lastAssistantMessage(16468)).toBe('nothing new yet.');
    expect(mockQuery.mock.calls[0]?.[1]).toEqual([16468]);
  });

  it('is null in a thread with nothing from the assistant', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    expect(await lastAssistantMessage(16468)).toBeNull();
  });
});

describe('doNotRepeatNote', () => {
  it('quotes the last reply and forbids sending it again', () => {
    const note = doNotRepeatNote('ახალი არაფერია.');

    expect(note).toContain('«ახალი არაფერია.»');
    expect(note).toContain('აღარ გაუგზავნო');
  });

  it('cuts a long reply rather than pasting it whole', () => {
    const note = doNotRepeatNote('ა'.repeat(2000));

    expect(note.length).toBeLessThan(900);
    expect(note).toContain('…»');
  });
});
