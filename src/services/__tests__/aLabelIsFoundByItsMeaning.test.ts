const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
  default: {},
}));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));
const mockWords = jest.fn();
jest.mock('../tools/tagMeaningWords', () => ({
  ...jest.requireActual('../tools/tagMeaningWords'),
  tagMeaningWords: (...a: unknown[]) => mockWords(...a),
}));

import { searchByTag } from '../tools/searchByTag';
import { MAX_TAG_WORDS, tagWordsFromModel } from '../tools/tagMeaningWords';

beforeEach(() => {
  jest.resetAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

/**
 * Tester's report 8 Nov, C6/C7: Levan saved as „fish farm Turkey" was not found
 * by „კრევეტი", and the run said nobody in the network works in the field.
 */
describe('a tag search that matched nothing', () => {
  it('searches the labels the query’s meaning goes by, and stays empty when they match nothing', async () => {
    mockWords.mockResolvedValue(['fish farm', 'aquaculture']);
    const result = (await searchByTag('501', 'კრევეტი')) as { found: boolean; query: string };
    expect(mockWords).toHaveBeenCalledWith('501', 'კრევეტი');
    expect(result).toEqual({ found: false, query: 'კრევეტი' });
    const searched = mockQuery.mock.calls.map(([, params]) => JSON.stringify(params));
    expect(searched.some((p) => p.includes('aquaculture'))).toBe(true);
  });

  it('asks for no other words when a search failed to finish', async () => {
    mockQuery.mockRejectedValue(new Error('canceling statement due to statement timeout'));
    const result = (await searchByTag('501', 'ელექტრიკოსი')) as { found: boolean };
    expect(result.found).toBe(false);
    expect(mockWords).not.toHaveBeenCalled();
  });
});

describe('the words the small model gives', () => {
  it('are read from its JSON, without the query, duplicates or blanks', () => {
    expect(
      tagWordsFromModel(
        '{"words": ["construction", "Construction", " ", "ელექტრიკოსი", "electrician"]}',
        'ელექტრიკოსი',
      ),
    ).toEqual(['construction', 'electrician']);
  });

  it('are capped, and nothing comes of a reply that is not JSON', () => {
    const many = JSON.stringify({ words: Array.from({ length: 12 }, (_, i) => `w${i}`) });
    expect(tagWordsFromModel(many, 'x')).toHaveLength(MAX_TAG_WORDS);
    expect(tagWordsFromModel('sorry, I cannot', 'x')).toEqual([]);
  });
});
