const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: mockQuery }));

import { answersElsewhereNote, answersInSiblingGoals } from '../answersElsewhere.service';

/** #8620: an answer that landed in a sibling goal was unseen by the first goal's wake. */
describe('answers in other goals of the same conversation (#8620)', () => {
  beforeEach(() => mockQuery.mockReset());

  it('reads answered asks from other goals started from this conversation', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ helper: 'თორნიკე', answer: 'ნომერი გადავეცი' }] });
    await expect(answersInSiblingGoals(74000, 35000)).resolves.toEqual([
      { helper: 'თორნიკე', answer: 'ნომერი გადავეცი' },
    ]);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('a.origin_thread_id = $1 AND a.task_id <> $2');
    expect(params.slice(0, 2)).toEqual([74000, 35000]);
  });

  it('tells the wake not to say the person did not answer', () => {
    const note = answersElsewhereNote([{ helper: 'თორნიკე', answer: 'ნომერი გადავეცი' }]);
    expect(note).toContain('თორნიკე');
    expect(note).toContain('ნუ დაწერ, რომ ამ ადამიანმა არ გიპასუხა');
  });

  it('says nothing when there are none', () => {
    expect(answersElsewhereNote([])).toBeNull();
  });
});
