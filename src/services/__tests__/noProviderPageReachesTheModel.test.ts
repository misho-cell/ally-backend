import { sourceAddress } from '../tools/webSearch';

/** #8622: Tavily's own company pages were cited to a real member as the firm's source. */
describe('the search provider’s own pages (#8622)', () => {
  it('drops a tavily.com address', () => {
    expect(sourceAddress('https://tavily.com/knowledge/company/abc123')).toEqual({});
    expect(sourceAddress('https://www.tavily.com/x')).toEqual({});
  });

  it('keeps every other address', () => {
    expect(sourceAddress('https://coral.ge/tours')).toEqual({ url: 'https://coral.ge/tours' });
    expect(sourceAddress('https://example.com/?ref=tavily.com')).toEqual({
      url: 'https://example.com/?ref=tavily.com',
    });
  });
});
