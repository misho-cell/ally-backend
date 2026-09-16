import {
  labelCramsTwoThings,
  looksLikeTypedChoice,
  mtavruliToMkhedruli,
  scrubButtonLabel,
  scrubMechanicalForStorage,
} from '../privacyScrub';

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

/**
 * Ticket 19 [7] — the reply text and the button labels, which are not the
 * same thing and had been sharing one rule.
 */
describe('a colon that only announces the list beneath it', () => {
  it('goes, and the sentence stays', () => {
    expect(scrubMechanicalForStorage('აი, რამდენიმე ვარიანტი:\n- ერთი\n- ორი')).toBe(
      'აი, რამდენიმე ვარიანტი\n- ერთი\n- ორი',
    );
    expect(scrubMechanicalForStorage('Three people:\n1. Nino\n2. Zura')).toBe(
      'Three people\n1. Nino\n2. Zura',
    );
  });

  it('leaves a colon that is doing real work', () => {
    // Nothing follows it but prose, so it is punctuation, not a heading.
    expect(scrubMechanicalForStorage('ერთი რამ: არავის მივწერე.')).toBe(
      'ერთი რამ: არავის მივწერე.',
    );
    expect(scrubMechanicalForStorage('19:30-ზე')).toBe('19:30-ზე');
  });
});

describe('scrubButtonLabel', () => {
  it('takes the question mark out — a button is the answer', () => {
    expect(scrubButtonLabel('გავაგზავნო?')).toBe('გავაგზავნო');
  });

  it('does not turn an em dash into a comma, the way prose does', () => {
    // The reply scrub writes „X, Y" here, which manufactures inside a label
    // exactly the comma this item counts.
    expect(scrubMechanicalForStorage('დირექტორი — Giorgi')).toBe('დირექტორი, Giorgi');
    expect(scrubButtonLabel('დირექტორი — Giorgi')).toBe('დირექტორი Giorgi');
  });

  it('leaves the Georgian alone', () => {
    // Every one of these is a real label from the last four days. A blanket
    // comma or hyphen strip breaks all three.
    expect(scrubButtonLabel('ნებისმიერი, ვინც საიტის შეკვეთებს ამტკიცებს')).toBe(
      'ნებისმიერი, ვინც საიტის შეკვეთებს ამტკიცებს',
    );
    expect(scrubButtonLabel('Archi Universi (Archi-ს კომპლექსი)')).toBe(
      'Archi Universi (Archi-ს კომპლექსი)',
    );
    expect(scrubButtonLabel('ჯერ Giorgi-ს პასუხს დავიცადოთ')).toBe('ჯერ Giorgi-ს პასუხს დავიცადოთ');
  });

  it('still strips the markdown a label should never carry', () => {
    expect(scrubButtonLabel('**დამტკიცებულია**')).toBe('დამტკიცებულია');
  });
});

describe('labelCramsTwoThings', () => {
  it('counts a label that joined two separate things', () => {
    expect(labelCramsTwoThings('კონდიციონერი, დამამტკიცე')).toBe(true);
    expect(labelCramsTwoThings('გენერალური დირექტორი, Giorgi Turashvili')).toBe(true);
  });

  it('does not count an answer word before its comma', () => {
    expect(labelCramsTwoThings('კი, Tornike-მ დაგვაკავშიროს')).toBe(false);
    expect(labelCramsTwoThings('დიახ, გავიცნობ თორნიკე აბულაძეს')).toBe(false);
    expect(labelCramsTwoThings('არა, ამჯერად არა')).toBe(false);
  });

  it('does not count a label with no comma at all', () => {
    expect(labelCramsTwoThings('მოგვიანებით')).toBe(false);
  });
});

/**
 * Ticket 20 row 201 — a capital letter from an alphabet that has none.
 *
 * Goal 3928: a plan message began its last sentence with U+1C93, a Mtavruli
 * letter. Mtavruli is Georgian's all-caps style, for headings and signs;
 * running text has no capitals, so one at the start of a sentence is an
 * English habit applied to an alphabet without the concept.
 */
describe('row 201 — Mtavruli never reaches a stored message', () => {
  const MTAVRULI_D = String.fromCodePoint(0x1c93);

  it('turns the reported letter into the ordinary one', () => {
    expect(mtavruliToMkhedruli(MTAVRULI_D)).toBe('დ');
  });

  it('maps both ends of the block, and the tail after the gap', () => {
    expect(mtavruliToMkhedruli(String.fromCodePoint(0x1c90))).toBe('ა');
    expect(mtavruliToMkhedruli(String.fromCodePoint(0x1cba))).toBe('ჺ');
    expect(mtavruliToMkhedruli(String.fromCodePoint(0x1cbd))).toBe('ჽ');
    expect(mtavruliToMkhedruli(String.fromCodePoint(0x1cbf))).toBe('ჿ');
  });

  it('leaves the two unassigned code points inside the range alone', () => {
    // Mapping them would produce letters that do not exist.
    const unassigned = String.fromCodePoint(0x1cbb) + String.fromCodePoint(0x1cbc);
    expect(mtavruliToMkhedruli(unassigned)).toBe(unassigned);
  });

  it('touches nothing else — ordinary Georgian, Latin and digits are untouched', () => {
    const text = 'დილა მშვიდობისა, Tornike — 2026';
    expect(mtavruliToMkhedruli(text)).toBe(text);
  });

  it('a stored reply carries no Mtavruli', () => {
    const reply = `${MTAVRULI_D}ავალება შესრულებულია.`;
    expect(scrubMechanicalForStorage(reply)).toBe('დავალება შესრულებულია.');
  });

  it('a button label carries none either', () => {
    expect(scrubButtonLabel(`${MTAVRULI_D}იახ`)).toBe('დიახ');
  });
});
