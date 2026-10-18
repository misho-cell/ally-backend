import { asksWhyAboutNamed, firstSentenceOnly, isShortWhy, whyAnswer } from '../whyThisPersonCut';

const EARLIER =
  'გიორგი კაპანაძე ყველაზე სწორი ადამიანია. რესტორნებთან არის დაკავშირებული.\n\n' +
  'რომელ ქალაქში სჭირდება ნიკა ბერიძეს მზარეული?';

describe('#4886: „why him?" about a person the last reply named', () => {
  it('is recognised in the tester’s words and in plain Georgian and English', () => {
    expect(asksWhyAboutNamed('გიორგი რა შუაშია?', EARLIER)).toBe(true);
    expect(asksWhyAboutNamed('რატომ გიორგი?', EARLIER)).toBe(true);
    expect(asksWhyAboutNamed('why Giorgi?', 'Giorgi Kapanadze is the one to ask.')).toBe(true);
  });

  it('is not a question about someone the last reply did not name', () => {
    expect(asksWhyAboutNamed('რატომ ლევანი?', EARLIER)).toBe(false);
  });

  it('is not a longer message, or one without a why', () => {
    expect(asksWhyAboutNamed('გიორგი კარგია', EARLIER)).toBe(false);
    expect(
      asksWhyAboutNamed(
        'რატომ გიორგი, როცა ნიკამ მითხრა, რომ თბილისში საერთოდ სხვა მზარეული უნდა?',
        EARLIER,
      ),
    ).toBe(false);
    expect(asksWhyAboutNamed('რატომ გიორგი?', null)).toBe(false);
  });
});

describe('the short why', () => {
  it('is a short message asking why, and nothing else', () => {
    expect(isShortWhy('გიორგი რა შუაშია?')).toBe(true);
    expect(isShortWhy('ნიკას მზარეული სჭირდება')).toBe(false);
  });
});

describe('the cut', () => {
  it('keeps the first sentence only', () => {
    expect(
      firstSentenceOnly(
        'გიორგის „რესტორანი“ აქვს შენახული, ამიტომ შეიძლება მზარეული იცნობდეს. ' +
          'ეს არ ნიშნავს, რომ დაგვეხმარება.\n\nრომელ ქალაქში?',
      ),
    ).toBe('გიორგის „რესტორანი“ აქვს შენახული, ამიტომ შეიძლება მზარეული იცნობდეს.');
  });

  it('leaves a one-sentence reply as it is', () => {
    expect(firstSentenceOnly('Giorgi has „restaurant" saved.')).toBe(
      'Giorgi has „restaurant" saved.',
    );
  });
});

describe('the sentence kept (tester 67128, thread 59007)', () => {
  const EARLIER_59007 =
    'გიორგი კაპანაძე შენს კონტაქტებშია და რესტორნის ნიშნითაა შენახული. ზუსტად რომელ მზარეულს ' +
    'ან რესტორანს იცნობს, ჩანაწერიდან არ ჩანს.\n\nგინდა, გიორგის ვკითხო კარგი რეკომენდაცია ვის აქვს?';

  it('never keeps „not involved" when the earlier reply gave the reason', () => {
    expect(whyAnswer('არ არის შუაში. ბოდიში.', 'გიორგი რა შუაშია?', EARLIER_59007)).toBe(
      'გიორგი კაპანაძე შენს კონტაქტებშია და რესტორნის ნიშნითაა შენახული.',
    );
  });

  it('skips a sentence that names him only to say he is not involved', () => {
    expect(whyAnswer('გიორგი არ არის შუაში.', 'გიორგი რა შუაშია?', EARLIER_59007)).toBe(
      'გიორგი კაპანაძე შენს კონტაქტებშია და რესტორნის ნიშნითაა შენახული.',
    );
  });

  it('keeps the reply’s own sentence that names him', () => {
    expect(
      whyAnswer(
        'კარგი კითხვაა. გიორგი მხოლოდ იმიტომ გამოჩნდა, რომ „რესტორნის“ ნიშნით არის შენახული. სხვა არაფერი.',
        'გიორგი რა შუაშია?',
        EARLIER_59007,
      ),
    ).toBe('გიორგი მხოლოდ იმიტომ გამოჩნდა, რომ „რესტორნის“ ნიშნით არის შენახული.');
  });

  it('keeps the first sentence when nothing names him', () => {
    expect(whyAnswer('ასე ჩანდა. მეტი არაფერი.', 'რატომ ის?', 'Nobody named.')).toBe('ასე ჩანდა.');
  });
});
