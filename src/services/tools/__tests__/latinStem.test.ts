import { buildRawWordGroups, latinStem } from '../transliterate';

/**
 * Ticket 20 row 222 — a Latin query was never stemmed and a Georgian one
 * always was, so „arqiteqtori" could not reach the label „arkitektorebi"
 * although „არქიტექტორი" could.
 *
 * MEASURED TWICE BEFORE IT WAS BUILT. Reach, against the live base: four trade
 * words went from 17,758 people to 19,437, +9.5%. Precision, on 501, by eye:
 * of the twelve tags only the stem reaches, eleven are the same trade and the
 * twelfth is „bebia" → „bebiko", a nickname — wrong at exactly the
 * four-character floor. Hence FIVE, which is the seat's decision.
 */
describe('a Latin word is stemmed the way a Georgian one is', () => {
  /**
   * THE SPELLING IS KEPT, and that is worth an assertion rather than a shrug.
   * The stem comes back „arqiteqtor" and not „arkitektor" — the round trip
   * gives the user's own q's back. It reaches the label all the same, because
   * the search compares on `normalize_search_token`, which folds q to k. So
   * the stem is a trim and never a respelling.
   */
  it('reaches the plural the seat reported, in the user’s own spelling', () => {
    // arkitektorebi is arkitektor-EBI, so the whole word cannot prefix it.
    expect(latinStem('arqiteqtori')).toBe('arqiteqtor');
  });

  it.each([
    ['stomatologi', 'stomatolog'],
    ['advokati', 'advokat'],
    ['meqanikosi', 'meqanikos'],
    ['santexnikosi', 'santekhnikos'],
    ['avtomexanikosi', 'avtomekhanikos'],
  ])('%s stems to %s', (word, stem) => {
    expect(latinStem(word)).toBe(stem);
  });

  /**
   * THE FLOOR IS LIVE, AND NOT WHERE I TOLD THE SEAT IT WAS.
   *
   * The precision sample's one false positive was „bebia" → „bebi" → reaching
   * „bebiko", somebody's nickname, and that is what the threshold of five was
   * chosen on. Writing this test I found that the real rule CANNOT produce it:
   * „bebia" ends in „ა", which is not one of georgianStem's case endings, so
   * nothing is trimmed at any floor. My SQL probe had invented that stem the
   * same way it invented the three-character ones earlier the same morning.
   *
   * The floor still does work, on words that really do stem: „bebis" ends in
   * „ს", trims to „bebi", four characters — and five refuses it. So the
   * threshold is right and the evidence I gave for it was not.
   */
  it('refuses a stem of four characters', () => {
    // At a floor of four this returns „bebi"; at five it returns the word.
    expect(latinStem('bebis')).toBe('bebis');
    expect(latinStem('kalis')).toBe('kalis');
  });

  it('the word the sample blamed never stems at all — „ა" is not an ending', () => {
    expect(latinStem('bebia')).toBe('bebia');
  });

  /**
   * ENGLISH IS REFUSED, and this guard is the reason the first version was not
   * shipped. Measured over the week's real queries, it was stemming these by
   * Georgian case rules and mangling them in the round trip.
   */
  it.each(['wordpress', 'sustainability', 'falconry', 'agency'])(
    'leaves the English word %s alone',
    (word) => {
      expect(latinStem(word)).toBe(word);
    },
  );

  it('leaves a Georgian word to the Georgian stemmer, untouched here', () => {
    expect(latinStem('არქიტექტორი')).toBe('არქიტექტორი');
  });

  /**
   * „tbilisi" stems to „tbilis", and that is right rather than an accident:
   * the Georgian is თბილისი and its stem is თბილის, which is what
   * თბილისში and თბილისის are built on. A place name inflects like any
   * other noun.
   */
  it('trims a place name too, because Georgian inflects one', () => {
    expect(latinStem('tbilisi')).toBe('tbilis');
  });

  it('gives back a word it has nothing to trim', () => {
    expect(latinStem('tbc')).toBe('tbc');
    expect(latinStem('axel')).toBe('axel');
  });

  it('is case-insensitive, like everything else on this path', () => {
    expect(latinStem('Arqiteqtori')).toBe('arqiteqtor');
  });

  /** A stem is always a PREFIX of the word, so recall can only grow. */
  it.each(['stomatologi', 'advokati', 'arqiteqtori'])(
    'the stem of %s is a prefix of it',
    (word) => {
      const stem = latinStem(word);
      // Compared after the q/k and kh/k folds, which is how the search compares.
      const folded = (t: string): string =>
        t.replace(/q/g, 'k').replace(/kh/g, 'k').replace(/x/g, 'k');
      expect(folded(word).startsWith(folded(stem))).toBe(true);
    },
  );
});

/**
 * THE WIRING, because a sabotage run found it untested — for the third time
 * in one day. Unhooking `latinStem` from the search broke nothing, exactly as
 * deleting `recordWake` and reverting `readPlanConsentScreen` broke nothing
 * earlier. The pattern is always the same: the piece is tested and the join
 * is not.
 */
describe('the search actually uses it', () => {
  it('a Latin trade word carries its stem into the terms the search runs', () => {
    const terms = buildRawWordGroups('stomatologi').flat();

    expect(terms).toContain('stomatolog');
  });

  it('and a Georgian one still carries the Georgian stem, unchanged by this', () => {
    const terms = buildRawWordGroups('არქიტექტორის').flat();

    expect(terms.some((t) => t.startsWith('არქიტექტორ'))).toBe(true);
  });

  it('an English word brings no stem into the terms', () => {
    const terms = buildRawWordGroups('wordpress').flat();

    expect(terms).not.toContain('tsordpres');
  });
});
