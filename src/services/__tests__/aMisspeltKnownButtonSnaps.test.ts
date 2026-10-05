import { snappedToKnownLabels } from '../buttonSpelling';

/** #1486 (39337): „წერ არა" stood for „ჯერ არა". */
describe('a known button misspelt by one letter', () => {
  it('becomes the known button', () => {
    expect(snappedToKnownLabels(['წერ არა', 'გადაწყდა'])).toEqual(['ჯერ არა', 'გადაწყდა']);
    expect(snappedToKnownLabels(['ვადასტურბ'])).toEqual(['ვადასტურებ']);
  });

  it('leaves other labels and short ones alone', () => {
    expect(snappedToKnownLabels(['ვებში ვეძებ', 'კა', 'ვიპოვე'])).toEqual([
      'ვებში ვეძებ',
      'კა',
      'ვიპოვე',
    ]);
  });
});
