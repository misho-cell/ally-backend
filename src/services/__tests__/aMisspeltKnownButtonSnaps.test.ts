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

/** #1783 (tester 41152): the channel button is the owner's voice, never „შენი გავლით". */
describe('the channel button', () => {
  it('reads „ჩემი გავლით" even when the model wrote „შენი გავლით"', () => {
    expect(snappedToKnownLabels(['შენი გავლით გავაგრძელოთ', 'არა, ამჯერად'])).toEqual([
      'ჩემი გავლით გავაგრძელოთ',
      'არა, ამჯერად',
    ]);
  });

  it('leaves „შენი" elsewhere in a label alone', () => {
    expect(snappedToKnownLabels(['შენი აზრით რა ჯობია'])).toEqual(['შენი აზრით რა ჯობია']);
  });
});
