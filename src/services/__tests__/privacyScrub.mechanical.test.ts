import { looksLikeTypedChoice, scrubMechanicalForStorage } from '../privacyScrub';

// Ticket 11 Task 1: the mechanical classes the prompt could not hold.
describe('scrubMechanicalForStorage', () => {
  it('strips bold and headers, turns em dashes into commas', () => {
    expect(scrubMechanicalForStorage('**გოგი ჩიქოვანი** — the head\n## People\n1. **Zviad**')).toBe(
      'გოგი ჩიქოვანი, the head\nPeople\n1. Zviad',
    );
  });

  it('applies to a button label the same way', () => {
    expect(scrubMechanicalForStorage('Davit Mikeladze — Study Prime')).toBe(
      'Davit Mikeladze, Study Prime',
    );
    expect(scrubMechanicalForStorage('20-50 people—quick wins')).toBe('20-50 people-quick wins');
  });
});

describe('looksLikeTypedChoice', () => {
  it('flags a closing question that offers alternatives in words', () => {
    expect(looksLikeTypedChoice('ორი გზა გვაქვს. პირდაპირ მივწერო თუ ჯერ მოვიცადო?')).toBe(true);
    expect(looksLikeTypedChoice('Do you want the short list or the full one?')).toBe(true);
  });

  it('leaves a plain question and a statement alone', () => {
    expect(looksLikeTypedChoice('რომელ უბანში?')).toBe(false);
    expect(looksLikeTypedChoice('3 კაცს ვკითხე, ხვალ დილით შეგატყობინებ.')).toBe(false);
  });
});
