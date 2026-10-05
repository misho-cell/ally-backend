import { buildAskOpening, withoutFramesOwnWords } from '../askOpening';

/** Tester 40229 (#1618): „X's assistant is asking: Hi, X is asking: …". */
describe('the question does not repeat the frame', () => {
  it('drops a greeting and a lead-in naming who asks', () => {
    expect(withoutFramesOwnWords('Hi, Levan is asking: do you know a painter?')).toBe(
      'do you know a painter?',
    );
    expect(withoutFramesOwnWords('გამარჯობა! ლევანი გეკითხება: იცნობ მხატვარს?')).toBe(
      'იცნობ მხატვარს?',
    );
  });

  it('leaves an ordinary question alone', () => {
    expect(withoutFramesOwnWords('Do you know a painter: car or house?')).toBe(
      'Do you know a painter: car or house?',
    );
  });

  it('applies in the opening message', () => {
    expect(
      buildAskOpening('en', 'Levan', null, 'Hello, Levan is asking: a painter?', 'first'),
    ).not.toMatch(/Hello|Levan is asking/);
  });
});

describe('a plain greeting to the helper', () => {
  it('stays as written', () => {
    expect(withoutFramesOwnWords('გამარჯობა ლიკა! გყავს კარგი სტომატოლოგი?')).toBe(
      'გამარჯობა ლიკა! გყავს კარგი სტომატოლოგი?',
    );
  });
});
