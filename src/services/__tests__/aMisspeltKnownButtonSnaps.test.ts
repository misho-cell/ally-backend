import { channelQuestionInNetaisVoice, snappedToKnownLabels } from '../buttonSpelling';

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

/** #1783 (tester 41417): the line above the channel buttons, in Netai's own voice. */
describe('channelQuestionInNetaisVoice', () => {
  const buttons = ['ჩემი გავლით', 'არა, ამჯერად'];

  it('says „შენი გავლით" and ends on a question', () => {
    expect(
      channelQuestionInNetaisVoice(
        'გიორგი შაბათს დილით არის თავისუფალი. გაცნობა ჩემი გავლით შევათანხმოთ.',
        buttons,
      ),
    ).toBe(
      'გიორგი შაბათს დილით არის თავისუფალი. გაცნობა შენი გავლით შევათანხმოთ.\n\n' +
        'პირდაპირ დაგაკავშირო, თუ შენი გავლით გავაგრძელოთ?',
    );
  });

  it('leaves a question that is already there', () => {
    const asked = 'მხოლოდ შაბათს დილით სცალია — პირდაპირ დავაკავშირო, თუ შენი გავლით?';
    expect(channelQuestionInNetaisVoice(asked, buttons)).toBe(asked);
  });

  it('touches nothing without the channel button', () => {
    expect(channelQuestionInNetaisVoice('ჩემი გავლით.', ['კი', 'არა'])).toBe('ჩემი გავლით.');
  });
});
