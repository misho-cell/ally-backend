import { withAssistantsSentLine } from '../assistantsSentLine';

describe('#5149: after a send the owner reads the agreed line (tester 58910, 58911)', () => {
  it('puts the line in place of „I wrote to Giorgi", keeping what follows', () => {
    const given =
      'გიორგი კაპანაძეს მივწერე, ნიკასთვის კარგი მზარეულის რეკომენდაცია ვთხოვე.\n\n' +
      'როგორც კი ვინმე გიპასუხებს, მაშინვე გეტყვი.';

    expect(withAssistantsSentLine(given, ['გიორგი კაპანაძე'], 'ka')).toBe(
      'ახლა ვწერ ასისტენტებს: გიორგი კაპანაძე.\n\nროგორც კი ვინმე გიპასუხებს, მაშინვე გეტყვი.',
    );
  });

  it('says it once when the reply claimed two sends', () => {
    const given = 'ნინოს მივწერე. ლევანსაც ვკითხე. როგორც კი ვინმე გიპასუხებს, მაშინვე გეტყვი.';

    expect(withAssistantsSentLine(given, ['ნინო ჩხეიძე', 'ლევან ბერიძე'], 'ka')).toBe(
      'ახლა ვწერ ასისტენტებს: ნინო ჩხეიძე, ლევან ბერიძე. როგორც კი ვინმე გიპასუხებს, მაშინვე გეტყვი.',
    );
  });

  it('adds the line when the reply did not say whom it wrote to', () => {
    expect(
      withAssistantsSentLine('როგორც კი ვინმე გიპასუხებს, მაშინვე გეტყვი.', ['ბესო'], 'ka'),
    ).toBe('როგორც კი ვინმე გიპასუხებს, მაშინვე გეტყვი.\n\nახლა ვწერ ასისტენტებს: ბესო.');
  });

  it('leaves a reply that already names the assistant', () => {
    const given = 'გიორგი კაპანაძის ასისტენტს მივწერე. როგორც კი ვინმე გიპასუხებს, მაშინვე გეტყვი.';

    expect(withAssistantsSentLine(given, ['გიორგი კაპანაძე'], 'ka')).toBe(given);
  });

  it('works in English, and leaves other languages and runs that sent nothing', () => {
    expect(withAssistantsSentLine('I wrote to Nika. I will tell you.', ['Nika'], 'en')).toBe(
      'Writing to the assistants now: Nika. I will tell you.',
    );
    expect(withAssistantsSentLine('Написал Нике.', ['Nika'], 'ru')).toBe('Написал Нике.');
    expect(withAssistantsSentLine('გიორგის მივწერე.', [], 'ka')).toBe('გიორგის მივწერე.');
  });

  it('does not touch a sentence about someone else', () => {
    const given = 'ნიკას მზარეული სჭირდება. გიორგის მივწერე.';

    expect(withAssistantsSentLine(given, ['გიორგი'], 'ka')).toBe(
      'ნიკას მზარეული სჭირდება. ახლა ვწერ ასისტენტებს: გიორგი.',
    );
  });
});
