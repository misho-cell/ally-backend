import { rewriteChangedTheQuestion } from '../rewriteTopic';

/** T2542 (conv 42811): the editor turned „number or surname?" into „do you work Saturdays?". */
describe('theEditorDoesNotChangeTheQuestion', () => {
  it('sees a rewrite that asks something else', () => {
    expect(
      rewriteChangedTheQuestion(
        'ზაზას ნომერი ან გვარი ხომ არ გახსოვს?',
        'შაბათობით მუშაობ თუ არა?',
      ),
    ).toBe(true);
  });

  it('leaves a rewrite of the same question, inflections and all', () => {
    expect(
      rewriteChangedTheQuestion('ზაზას ნომერი ან გვარი ხომ არ გახსოვს?', 'ზაზას ნომერი გახსოვს?'),
    ).toBe(false);
    expect(
      rewriteChangedTheQuestion(
        'იცნობს თუ არა გია ბერიძეს და გამაცნობს თუ არა',
        'გია ბერიძეს იცნობ? თუ კი, გამაცნობ?',
      ),
    ).toBe(false);
    expect(rewriteChangedTheQuestion('Do you know a good plumber?', 'Know any plumber?')).toBe(
      false,
    );
  });

  it('does not judge a draft too short to have a topic', () => {
    expect(rewriteChangedTheQuestion('კი?', 'შაბათობით მუშაობ?')).toBe(false);
  });
});
