jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: jest.fn() } },
}));
jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordClaudeUsage: jest.fn().mockResolvedValue(undefined),
}));

import { query } from '../../db/postgres/client';
import anthropic from '../../config/anthropic';
import { askBoundaryBlocks } from '../askBoundary.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockCreate = (anthropic as unknown as { messages: { create: jest.Mock } }).messages.create;

const PHONE = '+995599000001';
const rows = (data: unknown[]) => ({ rows: data, rowCount: data.length }) as never;
const modelSays = (covered: boolean): void => {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: JSON.stringify({ covered }) }],
    usage: { input_tokens: 1, output_tokens: 1 },
  });
};

/**
 * #1915 (the phone report, point 73): „do not ask me about this topic", and a
 * second question on it in other words still reached her. A closed topic stays
 * closed however the question is worded.
 */
beforeEach(() => {
  mockQuery.mockReset();
  mockCreate.mockReset();
});

describe('a closed topic, asked about in other words', () => {
  it('is stopped when the model reads the question as that topic', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([])) // no word in common with the stored terms
      .mockResolvedValueOnce(rows([{ topic: 'plumbing', term: 'plumb' }]));
    modelSays(true);

    await expect(
      askBoundaryBlocks(PHONE, 'Who could fix a leaking pipe under my sink?'),
    ).resolves.toBe(true);
    expect(String(mockCreate.mock.calls[0][0].messages[0].content)).toContain('- plumbing');
  });

  it('lets a question on another topic through', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([{ topic: 'plumbing', term: 'plumb' }]));
    modelSays(false);

    await expect(askBoundaryBlocks(PHONE, 'Do you know a good dentist?')).resolves.toBe(false);
  });

  it('never calls the model for somebody with no boundary at all', async () => {
    mockQuery.mockResolvedValueOnce(rows([])).mockResolvedValueOnce(rows([]));

    await expect(askBoundaryBlocks(PHONE, 'Do you know a good dentist?')).resolves.toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('fails closed: an unreadable answer stops the send rather than letting it through', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([{ topic: 'plumbing', term: 'plumb' }]));
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'not json' }], usage: {} });

    await expect(askBoundaryBlocks(PHONE, 'Who could fix a pipe?')).rejects.toThrow();
  });
});
