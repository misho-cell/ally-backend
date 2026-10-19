import { readFileSync } from 'fs';
import { join } from 'path';
import { withAskerAsTheOneInNeed } from '../askerInNeed';

/** The tester's 68882, thread 60633, as Zurab received it. */
const SENT =
  'სალამი, ზურაბს სჭირდება დახმარება, 3 კვირაა ბიზნეს სესხზე განაცხადი აქვს გაკეთებული ' +
  'და კონკრეტულ პასუხს ვერ იღებს, შეგიძლია გადახედო?';

describe('#5249: the reader of a question is never the one in need', () => {
  it('puts the asker where the reader’s name stood', () => {
    const out = withAskerAsTheOneInNeed(SENT, 'ზურაბ თიბისი', 'გიორგი', 'ka');
    expect(out.startsWith('სალამი, გიორგის სჭირდება დახმარება, 3 კვირაა')).toBe(true);
    expect(out).not.toContain('ზურაბს სჭირდება');
  });

  it('reads a name saved with its nominative „-ი"', () => {
    expect(withAskerAsTheOneInNeed('ზურაბს სჭირდება რჩევა', 'ზურაბი', 'ნინო', 'ka')).toBe(
      'ნინოს სჭირდება რჩევა',
    );
  });

  it('does the same in English', () => {
    expect(
      withAskerAsTheOneInNeed('Hi, Zurab needs help with a loan', 'Zurab', 'Giorgi', 'en'),
    ).toBe('Hi, Giorgi needs help with a loan');
  });

  it('leaves a right question alone, and another person’s need', () => {
    const right = 'გიორგის სჭირდება დახმარება, შეგიძლია გადახედო?';
    expect(withAskerAsTheOneInNeed(right, 'ზურაბ', 'გიორგი', 'ka')).toBe(right);
    expect(withAskerAsTheOneInNeed('ზურაბიჩს სჭირდება', 'ზურაბ', 'გიორგი', 'ka')).toBe(
      'ზურაბიჩს სჭირდება',
    );
    expect(withAskerAsTheOneInNeed(SENT, null, 'გიორგი', 'ka')).toBe(SENT);
  });

  it('is wired after the editor, on every outgoing question', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).toContain('question: withAskerAsTheOneInNeed(');
  });
});
