const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({ query: (...a: unknown[]) => mockQuery(...a) }));
const mockCreate = jest.fn();
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: (...a: unknown[]) => mockCreate(...a) } },
}));
const mockRecord = jest.fn();
jest.mock('../costLedger.service', () => ({
  recordClaudeUsage: (...a: unknown[]) => mockRecord(...a),
}));
const mockEmit = jest.fn();
jest.mock('../sse.service', () => ({ emitThreadUpdated: (...a: unknown[]) => mockEmit(...a) }));

import {
  CASE_DESCRIPTION_MAX_CHARS,
  caseDescriptionPrompt,
  caseFactsText,
  cleanCaseDescription,
} from '../caseDescription';
import { describeIfMissing, refreshCaseDescription } from '../caseDescriptionWriter.service';

const GOOD = 'შენ ბუღალტერს ეძებ შენი მცირე ფირმისთვის. ლაშას ასისტენტს მივწერე. პასუხს ველოდებით.';

function answers(text: string): void {
  mockCreate.mockResolvedValue({ content: [{ type: 'text', text }], usage: {} });
}

beforeEach(() => {
  jest.resetAllMocks();
  mockRecord.mockResolvedValue(undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

/** 5413 (Giorgi): the case-details panel says in two or three sentences what the case is. */
describe('a case says what it is about', () => {
  it('asks for two or three sentences in the owner’s language, assistants named', () => {
    const prompt = caseDescriptionPrompt('Georgian');
    expect(prompt).toContain('2 or 3 short plain sentences');
    expect(prompt).toContain('in Georgian only');
    expect(prompt).toContain("<name>'s assistant");
  });

  it('gives the model the title, the notes and the latest lines, each bounded', () => {
    const text = caseFactsText({
      title: 'ბუღალტერი',
      brief: 'ნ'.repeat(5000),
      lines: ['owner: '.concat('ა'.repeat(5000))],
    });
    expect(text).toContain('Title: ბუღალტერი');
    expect(text.length).toBeLessThan(2000);
  });

  it('keeps a plain description and refuses anything that is not one', () => {
    expect(cleanCaseDescription(GOOD)).toBe(GOOD);
    expect(cleanCaseDescription('')).toBeNull();
    expect(cleanCaseDescription('ა'.repeat(CASE_DESCRIPTION_MAX_CHARS + 1))).toBeNull();
    expect(cleanCaseDescription('- one\n- two\n- three')).toBeNull();
    expect(
      cleanCaseDescription('დავურეკე ნომერზე +995 599 12 34 56 და ველოდები პასუხს.'),
    ).toBeNull();
    expect(cleanCaseDescription('გავუგზავნე request_introduction ლაშას ასისტენტს.')).toBeNull();
    expect(
      cleanCaseDescription('ერთი. ორი წინადადება. სამი წინადადება. ოთხი წინადადება.'),
    ).toBeNull();
  });

  it('writes nothing while the switch is off', async () => {
    await expect(refreshCaseDescription('7', 9, false)).resolves.toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('when on: writes the description and sends it to the owner’s screens', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ title: 'ბუღალტერი', brief: 'notes' }] })
      .mockResolvedValueOnce({ rows: [{ role: 'user', content: 'ბუღალტერი მჭირდება' }] })
      .mockResolvedValueOnce({ rows: [] });
    answers(GOOD);

    await expect(refreshCaseDescription('7', 9, true)).resolves.toBe(true);
    const update = mockQuery.mock.calls[2] as [string, unknown[], number];
    expect(update[0]).toContain('SET case_description = $2');
    expect(update[1]).toEqual([9, GOOD]);
    expect(mockEmit).toHaveBeenCalledWith('7', { id: 9, case_description: GOOD });
  });

  it('when on: a conversation with no goal gets no description', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(refreshCaseDescription('7', 9, true)).resolves.toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('when on: an unusable answer keeps the last description', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ title: 't', brief: null }] })
      .mockResolvedValueOnce({ rows: [] });
    answers('- a\n- b');
    await expect(refreshCaseDescription('7', 9, true)).resolves.toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});

/** 5413 retest (Giorgi, 20 Oct): 4 of his 7 open cases had no description. */
describe('a case opened without a description', () => {
  const T0 = 1_000_000;

  it('gets one written, and is not asked again within half an hour', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ lacks: true }] })
      .mockResolvedValueOnce({ rows: [{ title: 'ბუღალტერი', brief: 'notes' }] })
      .mockResolvedValueOnce({ rows: [{ role: 'user', content: 'ბუღალტერი მჭირდება' }] })
      .mockResolvedValueOnce({ rows: [] });
    answers(GOOD);
    await expect(describeIfMissing('7', 101, T0)).resolves.toBe(true);
    expect(mockEmit).toHaveBeenCalledWith('7', { id: 101, case_description: GOOD });
    await expect(describeIfMissing('7', 101, T0 + 60_000)).resolves.toBe(false);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('leaves a case that has one, or no open goal, alone', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ lacks: false }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(describeIfMissing('7', 102, T0)).resolves.toBe(false);
    await expect(describeIfMissing('7', 103, T0)).resolves.toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
