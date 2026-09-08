import { stepLabel } from '../stepLabel';

// Ticket 10 Task 2 (b): a live step is one short line, never a paragraph.
describe('stepLabel', () => {
  it('keeps a short one-line step as it is', () => {
    expect(stepLabel('სახელით ვეძებ…')).toBe('სახელით ვეძებ…');
  });

  it('cuts a paragraph to its first sentence', () => {
    expect(
      stepLabel(
        'ვეძებ BMW-ს ხელოსანს თბილისში. ჯერ ტეგებით ვნახავ, მერე ფაქტებით, და თუ არაფერი ' +
          'გამოვიდა — მეორე წრეში გადავალ, რადგან ეს საკითხი ხშირად ნაცნობის ნაცნობთან წყდება.',
      ),
    ).toBe('ვეძებ BMW-ს ხელოსანს თბილისში.');
  });

  it('a first sentence that is itself too long is cut with an ellipsis', () => {
    const long = 'ა'.repeat(200);
    const out = stepLabel(long);
    expect(out.length).toBe(120);
    expect(out.endsWith('…')).toBe(true);
  });

  it('flattens line breaks and stops at the first one', () => {
    expect(stepLabel('Searching by employer\nThen by industry')).toBe('Searching by employer');
    expect(stepLabel('   ')).toBe('');
  });
});
