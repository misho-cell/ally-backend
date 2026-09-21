jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { classifyToken, isNameToken, readLabels } from '../labelReader.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

/** phone, who saved it, what they typed. */
function alias(phone: string, contactId: string, label: string) {
  return { phone, contact_id: contactId, alias: label };
}

/**
 * The reader makes three queries: the aliases, then how big each company word
 * is, then where this person ranks inside it.
 */
function routeLabelQueries(opts: {
  aliases?: ReturnType<typeof alias>[];
  sizes?: { word: string; org_size: string }[];
  ranks?: { phone: string; word: string; rank: string }[];
}): void {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('FROM "UserAlias" ua'))
      return Promise.resolve(rows(opts.aliases ?? []) as never);
    if (sql.includes('AS org_size')) return Promise.resolve(rows(opts.sizes ?? []) as never);
    if (sql.includes('AS rank')) return Promise.resolve(rows(opts.ranks ?? []) as never);
    return Promise.resolve(rows([]) as never);
  });
}

beforeEach(() => jest.resetAllMocks());

describe('L1 — is this token a name', () => {
  it('knows the founder-supplied names, in both scripts and their diminutives', () => {
    for (const token of ['giorgi', 'goga', 'dato', 'nika', 'გიორგი', 'ლევანი']) {
      expect(isNameToken(token, false)).toBe(true);
    }
    // „gio" is on the founder's ambiguity list, so it is a name only where a
    // name goes — his own instruction, applied to the whole column.
    expect(isNameToken('gio', true)).toBe(true);
    expect(isNameToken('gio', false)).toBe(false);
  });

  it('knows a surname by its ending, without a list of surnames', () => {
    for (const token of ['აბულაძე', 'ქოიავა', 'ლაშქარავა', 'იაშვილი']) {
      expect(isNameToken(token, false)).toBe(true);
    }
    // And the same endings in Latin — how much of this base is actually typed.
    for (const token of ['burchuladze', 'kikvidze', 'lashkarava', 'iashvili']) {
      expect(isNameToken(token, false)).toBe(true);
    }
  });

  // The fifteen names that are also ordinary words.
  it('„avto" is a man at the front of a label and a car anywhere else', () => {
    expect(isNameToken('avto', true)).toBe(true);
    expect(isNameToken('avto', false)).toBe(false);
  });

  it('a company is not a name', () => {
    for (const token of ['datamind', 'lemondo', 'quickshipper', 'arci']) {
      expect(isNameToken(token, false)).toBe(false);
      expect(isNameToken(token, true)).toBe(false);
    }
  });
});

describe('L2 — what a context token is', () => {
  it('everything that is not a name and not a dictionary word is the COMPANY word', () => {
    expect(classifyToken('datamind', false)).toBe('organisation');
    expect(classifyToken('lemondo', false)).toBe('organisation');
  });

  it('keeps the four dictionaries apart', () => {
    expect(classifyToken('pediatri', false)).toBe('trade');
    expect(classifyToken('advokati', false)).toBe('profession_with_clients');
    expect(classifyToken('mezobeli', false)).toBe('relation');
    expect(classifyToken('batumi', false)).toBe('place');
  });

  // A title is the rare thing a label carries; fit already reads it, and it
  // must not be counted as the company word.
  it('a role word is set aside, never counted as a company', () => {
    expect(classifyToken('direktori', false)).toBe('role');
  });

  // Georgian builds agent nouns on „-ელი", exactly like a surname. Asked in
  // the wrong order, the first live run read „დამლაგებელი" — a cleaner — as
  // this person's family name and searched the web for it.
  it('a trade that ends like a surname is still a trade', () => {
    expect(classifyToken('დამლაგებელი', false)).toBe('trade');
    expect(classifyToken('მასწავლებელი', false)).toBe('trade');
  });

  it('but a real surname with the same ending is still a name', () => {
    expect(classifyToken('ქოიავა', false)).toBe('name');
    expect(classifyToken('burchuladze', false)).toBe('name');
  });

  /**
   * 20 September, the one-script sweep. Forty-six dictionary entries sat here
   * in Georgian only, so the same word typed in Latin — which is how much of
   * this base is written — was read as somebody's EMPLOYER.
   */
  describe('a word typed in Latin is the same word', () => {
    it.each([
      ['xelosani', 'trade'],
      ['khelosani', 'trade'],
      ['eqimi', 'trade'],
      ['ekimi', 'trade'],
      ['mdzgolma', 'trade'],
      ['mdzgholi', 'trade'],
      ['dacvis', 'trade'],
      ['maklerad', 'trade'],
      ['maliari', 'trade'],
      ['mkeravi', 'trade'],
      ['mascavlebeli', 'trade'],
      ['bughalteri', 'trade'],
      ['durgali', 'trade'],
      ['potograpi', 'trade'],
      ['mgebavi', 'trade'],
      ['shemdugebeli', 'trade'],
      ['klaselma', 'relation'],
      ['bitsola', 'relation'],
      ['telavi', 'place'],
      ['zugdidi', 'place'],
      ['poti', 'place'],
      ['foti', 'place'],
      ['gudauri', 'place'],
      ['dighomi', 'place'],
      ['binis', 'place'],
      ['nacilebi', 'place'],
      ['aftiaqi', 'place'],
    ])('%s is %s, not a company', (token, kind) => {
      expect(classifyToken(token, false)).toBe(kind);
    });
  });

  /**
   * The four the same sweep found and REFUSED, each on what its buried
   * carriers turned out to be. containsAny is a substring match, so a short
   * word costs whatever longer words contain it — and the dictionaries are
   * read BEFORE the surname endings, so a wrong one silently eats a name.
   */
  describe('the short words the sweep refused', () => {
    it('„gori" stays out: it is inside Igori, and Igori is a man', () => {
      // 175 carriers. The list knows him; adding „gori" would make him a town.
      expect(classifyToken('igori', true)).toBe('name');
    });

    it('„lari" stays out: it is inside Beglari, Ilarioni, solariumi', () => {
      expect(classifyToken('beglari', false)).not.toBe('place');
      expect(classifyToken('ilarioni', false)).not.toBe('place');
      expect(classifyToken('solariumi', false)).not.toBe('place');
    });

    /**
     * „chkapelia" and „grigori" are read as company words today, and that is
     * the milder of the two wrong answers rather than a second bug: an
     * unconfirmed company word is dropped by the three-saver rule, so it
     * reaches nobody. A dictionary hit is FINAL — it is never reconsidered.
     * That asymmetry is the whole reason a short word is refused even when its
     * carriers run to thousands.
     */
    it('„kape" stays out: Chkapelia would go from provisional to settled', () => {
      expect(classifyToken('chkapelia', false)).toBe('organisation');
      expect(classifyToken('grigori', false)).toBe('organisation');
    });

    it('and „kafe", the word itself, was never in doubt', () => {
      expect(classifyToken('kafe', false)).toBe('place');
    });
  });

  /**
   * And then the short words came in anyway, through the front door instead of
   * the substring one. These are the commonest words in the entire phonebook —
   * „deda" is on 26,533 people — and they were the last to arrive, because a
   * substring dictionary cannot hold a four-letter word.
   */
  describe('the short words, matched as a whole token', () => {
    it.each([
      ['deda', 'relation'],
      ['dedas', 'relation'],
      ['დედა', 'relation'],
      ['დედას', 'relation'],
      ['mama', 'relation'],
      ['mamao', 'relation'],
      ['bebo', 'relation'],
      ['dzia', 'relation'],
      ['ძია', 'relation'],
      ['gori', 'place'],
      ['goris', 'place'],
      ['goridan', 'place'],
      ['saxli', 'place'],
      ['saxlis', 'place'],
      ['manqana', 'place'],
      ['aveji', 'place'],
      ['ავეჯი', 'place'],
    ])('%s is %s', (token, kind) => {
      expect(classifyToken(token, false)).toBe(kind);
    });

    // „ბებია" is why this tier is read BEFORE the surname endings: it ends in
    // „ია", so the ending rule claimed it and a grandmother was somebody's
    // family name.
    it('a grandmother is no longer a surname', () => {
      expect(classifyToken('ბებია', false)).toBe('relation');
      expect(classifyToken('bebia', false)).toBe('relation');
    });

    it('the anchor is what keeps Igori a man and Mamardashvili a family', () => {
      expect(classifyToken('igori', false)).toBe('name');
      expect(classifyToken('gorishvili', false)).toBe('name');
      expect(classifyToken('mamardashvili', false)).toBe('name');
    });

    // Three letters is exactly „dze". Without the second guard the adjective
    // „big" would eat 117 people's family name.
    it('an ending that is a SURNAME ending is not a case ending', () => {
      expect(classifyToken('dididze', false)).toBe('name');
    });

    it('„lari" is still refused: Larisa cannot be told from the money', () => {
      expect(classifyToken('larisa', false)).not.toBe('place');
      expect(classifyToken('lari', false)).not.toBe('place');
    });
  });
});

describe('L3/L4 — the three numbers and the signals', () => {
  it('„runs it": a small company word, and he is its most-saved person', async () => {
    routeLabelQueries({
      aliases: [
        alias('+995500000001', '1', 'Vaxo Burchuladze DataMind'),
        alias('+995500000001', '2', 'vaxo datamind'),
        alias('+995500000001', '3', 'ვახო datamind'),
      ],
      sizes: [{ word: 'datamind', org_size: '4' }],
      ranks: [{ phone: '+995500000001', word: 'datamind', rank: '1' }],
    });

    const out = await readLabels(['+995500000001']);
    const signals = out.get('+995500000001');

    expect(signals?.org_set).toEqual(['datamind']);
    expect(signals?.runs_it).toBe(true);
    expect(signals?.in_big_organisation).toBe(false);
    expect(signals?.savers).toBe(3);
  });

  it('a big company word places him in a crowd and says nothing about his seat', async () => {
    routeLabelQueries({
      aliases: [
        alias('+995500000002', '1', 'Levan Borchkhadze Tbc'),
        alias('+995500000002', '2', 'levan tbc'),
        alias('+995500000002', '3', 'ლევან tbc'),
      ],
      sizes: [{ word: 'tbc', org_size: '3400' }],
      ranks: [{ phone: '+995500000002', word: 'tbc', rank: '870' }],
    });

    const signals = (await readLabels(['+995500000002'])).get('+995500000002');

    expect(signals?.in_big_organisation).toBe(true);
    expect(signals?.runs_it).toBe(false);
  });

  it('three company words in three directions is the hustler shape', async () => {
    routeLabelQueries({
      aliases: [
        alias('+995500000003', '1', 'Tornike Ally'),
        alias('+995500000003', '2', 'tornike ally'),
        alias('+995500000003', '3', 'tornike ally'),
        alias('+995500000003', '1', 'tornike arci'),
        alias('+995500000003', '2', 'tornike arci'),
        alias('+995500000003', '3', 'tornike arci'),
        alias('+995500000003', '1', 'tornike ggi'),
        alias('+995500000003', '2', 'tornike ggi'),
        alias('+995500000003', '3', 'tornike ggi'),
      ],
      sizes: [
        { word: 'ally', org_size: '40' },
        { word: 'arci', org_size: '30' },
        { word: 'ggi', org_size: '8' },
      ],
    });

    const signals = (await readLabels(['+995500000003'])).get('+995500000003');

    expect(signals?.org_count).toBe(3);
    expect(signals?.several_directions).toBe(true);
  });

  // The word must be agreed on. One saver's typo is not a company — with four
  // savers, 20% is one person, which is how „ORBI IAFAD" reached the list once.
  it('a word one person typed once is not a company word', async () => {
    routeLabelQueries({
      aliases: [
        alias('+995500000004', '1', 'ზურა სანტექნიკოსი'),
        alias('+995500000004', '2', 'ზურა სანტექნიკოსი'),
        alias('+995500000004', '3', 'ზურა სანტექნიკოსი'),
        alias('+995500000004', '4', 'ზურა orbiiafad'),
      ],
    });

    const signals = (await readLabels(['+995500000004'])).get('+995500000004');

    expect(signals?.org_set).toEqual([]);
    expect(signals?.trade_only).toBe(true);
  });

  // The first live run searched the register for „Levan Shalamberidze Axel
  // Member" — the label, company word and all. The caller needs a NAME.
  it('hands back the name it stripped, commonest first', async () => {
    routeLabelQueries({
      aliases: [
        alias('+995500000010', '1', 'Levan Shalamberidze Axel'),
        alias('+995500000010', '2', 'levan shalamberidze axel'),
        alias('+995500000010', '3', 'levan shalamberidze'),
      ],
      sizes: [{ word: 'axel', org_size: '60' }],
    });

    const signals = (await readLabels(['+995500000010'])).get('+995500000010');

    expect(signals?.name_tokens.slice(0, 2)).toEqual(['levan', 'shalamberidze']);
    expect(signals?.name_tokens).not.toContain('axel');
  });

  it('a name and nothing else is NOT YET, never a target as written', async () => {
    routeLabelQueries({
      aliases: [
        alias('+995500000005', '1', 'Tornike Mezobeli'),
        alias('+995500000005', '2', 'tornike mezobeli'),
      ],
    });

    const signals = (await readLabels(['+995500000005'])).get('+995500000005');

    expect(signals?.name_only).toBe(true);
    expect(signals?.org_count).toBe(0);
  });

  it('a profession with clients opens a door a trade closes', async () => {
    routeLabelQueries({
      aliases: [
        alias('+995500000006', '1', 'ნინო ადვოკატი'),
        alias('+995500000006', '2', 'nino advokati'),
      ],
    });

    const signals = (await readLabels(['+995500000006'])).get('+995500000006');

    expect(signals?.profession_with_clients).toBe(true);
    expect(signals?.trade_only).toBe(false);
  });

  it('„axel" is a hint, and says so — the roster is what confirms it', async () => {
    routeLabelQueries({
      aliases: [
        alias('+995500000007', '1', 'Jaba Kikvidze. Axel'),
        alias('+995500000007', '2', 'jaba axel'),
        alias('+995500000007', '3', 'jaba axel'),
      ],
      sizes: [{ word: 'axel', org_size: '60' }],
    });

    const signals = (await readLabels(['+995500000007'])).get('+995500000007');

    expect(signals?.axel_hint).toBe(true);
  });
});

/**
 * 15 September, found in the production log rather than reported:
 *
 *   [target-list] company-word read failed for 20 words: statement timeout
 *   [target-list] company-word read failed for 17 words: statement timeout
 *
 * Every run. The chunking was written for exactly this case — "read in chunks
 * so one slow word cannot sink the whole batch" — and there was no catch
 * inside the loop, so the throw left it and sank every word in the call. The
 * chunking gave no isolation at all.
 */
describe('companyWordShare asks in a shape the index can answer', () => {
  it('asks per word, with the pattern as a parameter — not built from a column', async () => {
    // The old shape passed an ARRAY and joined it through a LATERAL, so the
    // pattern came from a column and pg_trgm could not read it: EXPLAIN on
    // prod showed Seq Scan where a literal gets a Bitmap Index Scan on
    // idx_user_alias_trgm. That was ~2.3s per word and the timeouts the log
    // recorded on every run.
    mockQuery.mockResolvedValue(rows([]) as never);
    const { companyWordShare } = await import('../labelReader.service');

    await companyWordShare(['tbc', 'capital', 'bank']);

    expect(mockQuery.mock.calls).toHaveLength(3);
    for (const [sql, params] of mockQuery.mock.calls) {
      expect(sql as string).not.toContain('LATERAL');
      expect(sql as string).toContain('LIKE $1');
      // The whole pattern is the parameter; nothing is concatenated in SQL.
      expect((params as unknown[])[0]).toMatch(/^%.+%$/);
    }
    expect((mockQuery.mock.calls[0][1] as unknown[])[0]).toBe('%tbc%');
  });

  it('keeps the words it could read and loses only the one that failed', async () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    let call = 0;
    mockQuery.mockImplementation(() => {
      call += 1;
      if (call === 1) return Promise.reject(new Error('canceling statement due to timeout'));
      // Three aliases carrying the word beside a surname-shaped token, which
      // is what says "company" rather than "somebody's name".
      return Promise.resolve(
        rows([
          { alias: 'nino kakhidze partners' },
          { alias: 'dato tsiklauri partners' },
          { alias: 'lasha beridze partners' },
        ]) as never,
      );
    });

    const { companyWordShare } = await import('../labelReader.service');
    const out = await companyWordShare(['tbc', 'partners']);

    // Before the catch existed the rejection escaped and there was no result
    // at all — one slow word lost every word in the call.
    expect(out.has('partners')).toBe(true);
    expect(out.has('tbc')).toBe(false);
    expect(spy).toHaveBeenCalled();
    expect(String(spy.mock.calls[0][0])).toContain('company-word read failed');
    spy.mockRestore();
  });

  /**
   * Found six hours after the fix above shipped, while chasing a different
   * 75-second tool call. „Twenty words at a few tens of milliseconds is a
   * second in total" is the happy path. Each word carries a 20-second timeout
   * and nothing bounded how many words arrive, so the unhappy path is twenty
   * of those in a row — every one honouring its budget, the caller waiting
   * minutes. buildTargetList feeds tier one of the curiosity queue, which runs
   * when a conversation opens.
   *
   * A per-query timeout bounds a query. It does not bound an answer.
   */
  it('stops asking when the loop has spent its budget, and says which words it dropped', async () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.resetModules();
    process.env.COMPANY_WORD_BUDGET_MS = '30';
    const slowQuery = (await import('../../db/postgres/client')).query as jest.MockedFunction<
      typeof query
    >;
    slowQuery.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(rows([]) as never), 20)),
    );

    const { companyWordShare } = await import('../labelReader.service');
    await companyWordShare(['one', 'two', 'three', 'four', 'five', 'six']);

    // Not all six: the budget stops the loop part-way.
    expect(slowQuery.mock.calls.length).toBeLessThan(6);
    expect(slowQuery.mock.calls.length).toBeGreaterThan(0);
    // And it is never silent about what it did not ask.
    expect(String(spy.mock.calls.at(-1)?.[0])).toContain('company-word budget spent');
    spy.mockRestore();
    delete process.env.COMPANY_WORD_BUDGET_MS;
  });

  it('asks nothing when there is nothing to ask about', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);
    const { companyWordShare } = await import('../labelReader.service');

    expect((await companyWordShare([])).size).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

/**
 * „Undefined" is on 59,111 alias rows, held by 42,694 people, every one written
 * in August 2026 by one of 809 savers. The whole alias is that single word — a
 * client writing the JavaScript value where a contact had no display name.
 *
 * `classifyToken` gives up on a token no dictionary claims and calls it an
 * ORGANISATION, so all 42,694 carried a company word named „Undefined", scored
 * `in_big_organisation`, and would have had the register pointed at that
 * company the moment the research runner was switched on.
 *
 * The employer FIELD was already safe: `labelEmployer` carried its own private
 * copy of the word. The target ENGINE was not — which is the split the
 * 16 September ruling was supposed to have ended. One list now.
 */
describe('junk that reached the label store is not a company', () => {
  it('names „undefined" as junk instead of guessing an organisation', () => {
    expect(classifyToken('undefined', false)).toBe('not_a_word');
    expect(classifyToken('undefined', true)).toBe('not_a_word');
  });

  it('still gives up towards organisation on a word it genuinely does not know', () => {
    // The fall-through has to survive: this fix names ONE measured token, it
    // does not change what happens to a real company nobody has heard of.
    expect(classifyToken('datamind', false)).toBe('organisation');
  });

  /**
   * Nothing goes on that list that has not been counted. „null" and „nan" are
   * the obvious neighbours and neither was among the 300 most-carried tokens,
   * so neither is there — a list guessed in advance eventually eats a word
   * somebody really wrote.
   */
  it('claims nothing about the neighbours nobody measured', () => {
    expect(classifyToken('null', false)).not.toBe('not_a_word');
  });

  /**
   * The four that were protected on one side of the wall and not the other.
   *
   * They sat in `labelEmployer`'s private list since 16 September, so the
   * employer FIELD never showed them — and `classifyToken` went on calling
   * them ORGANISATIONS for the target engine the whole time. 35,889 people
   * carry one of them.
   */
  it('stops calling the employer list’s words companies', () => {
    for (const word of ['axali', 'klienti', 'chemi', 'ჩემი']) {
      expect(classifyToken(word, false)).toBe('not_a_word');
      expect(classifyToken(word, true)).toBe('not_a_word');
    }
  });

  /**
   * ORDER, and this is the test I needed and did not have.
   *
   * I read that list FIRST and seven tests went red in a minute: it carries
   * „დედა", „ბებია", „სახლი", „მანქანა", which this function already gets
   * right. „Never print this as an EMPLOYER" is not „this identifies nobody" —
   * a mother identifies a relation. The list replaces the two GUESSES at the
   * bottom of classifyToken; it never overrules a dictionary.
   */
  /**
   * Five names the list did not hold, found by classifying the 300
   * most-carried tokens and reading the LEAD SHARE of everything that came
   * back „organisation". A name leads its label, a company follows one, and
   * both ends are measured: nino .91, tbc .37.
   *
   *   megi .91 · madona .91 · nia .90 · erekle .89 · bela .88
   *
   * `skola` came back „organisation" too and was LEFT THERE — it is already in
   * the organisation dictionary, and its .08 lead share is a company word
   * behaving like one, not a name hiding.
   */
  it('reads the five the base calls names', () => {
    for (const name of ['megi', 'madona', 'nia', 'erekle', 'bela']) {
      expect(classifyToken(name, false)).toBe('name');
    }
    expect(classifyToken('skola', false)).toBe('organisation');
  });

  it('never takes a word a dictionary already owns', () => {
    expect(classifyToken('დედა', false)).toBe('relation');
    expect(classifyToken('bebia', false)).toBe('relation');
    expect(classifyToken('სახლი', false)).toBe('place');
    expect(classifyToken('manqana', false)).toBe('place');
  });
});

/**
 * 21 September. The same measurement as the five names above, run again over
 * the 400 most-carried tokens in the base. Forty-six still came back
 * „organisation"; ten of those are rescued in a name's position, and of the
 * rest these are the ones the labels themselves settled.
 *
 * Every entry behind these tests was measured WHOLE-BASE, not on a sample —
 * every token in the alias store that contains the word, listed before the
 * word was written down. That is what makes the difference between „kurieri",
 * where there is no collateral at all, and „dzidz", which is three Georgian
 * families.
 */
describe('the trades, relations and places the base still called companies', () => {
  /**
   * The abbreviation, not the word. „maswavlebel" was already here and could
   * not see „nino masw matematika" — 2,690 „masw" and 2,333 „maswi" per
   * script, read as a company. Shortening the entry to four characters is safe
   * only because every token in the base containing „masw" is this word or a
   * misspelling of it.
   */
  it('reads the teacher written short, and the misspellings with it', () => {
    for (const t of ['masw', 'maswi', 'maswavlebeli', 'maswaclebeli', 'მასწ', 'მასწი']) {
      expect(classifyToken(t, false)).toBe('trade');
    }
  });

  it('reads the courier, the stylist and the insurance seller in both scripts', () => {
    for (const t of ['kurieri', 'კურიერი', 'stilisti', 'სტილისტი', 'dazgveva', 'დაზღვევა']) {
      expect(classifyToken(t, false)).toBe('trade');
    }
  });

  /**
   * THE ONE THAT HAD TO BE A WHOLE WORD. The stem „dzidz" is Dzidziguri (752
   * people across both scripts), Dzidzishvili and Dzidzikashvili — a thousand
   * surnames that would have become a job. The full word costs two families in
   * „-a", which is written down where the entry is.
   */
  it('reads the nanny without eating the three families called Dzidz-', () => {
    expect(classifyToken('dzidza', false)).toBe('trade');
    expect(classifyToken('ძიძა', false)).toBe('trade');
    expect(classifyToken('dzidziguri', false)).not.toBe('trade');
    expect(classifyToken('dzidzishvili', false)).toBe('name');
    expect(classifyToken('ძიძიშვილი', false)).toBe('name');
  });

  it('reads „friend" and the Pekini avenue', () => {
    expect(classifyToken('megobari', false)).toBe('relation');
    expect(classifyToken('მეგობარი', false)).toBe('relation');
    expect(classifyToken('pekini', false)).toBe('place');
    expect(classifyToken('პეკინი', false)).toBe('place');
  });

  /**
   * „sabas babu dedis mxridan" — Saba's grandfather on his mother's side.
   * 8,700 people carried it as a company word with an org_size sixty times
   * over `BIG_ORG_SIZE`.
   */
  it('reads the grandfather in both of the words Georgian uses', () => {
    for (const t of ['babu', 'babua', 'babus', 'ბაბუ', 'ბაბუა', 'papa', 'პაპა']) {
      expect(classifyToken(t, false)).toBe('relation');
    }
  });

  /**
   * THE GUARD THAT MADE „papa" POSSIBLE, and the reason it is a test.
   *
   * The anchored rule compares the ENDING to a surname ending, exactly — and a
   * surname ending overlaps the word in front of it. „papava" is „papa" plus
   * „va", and „va" is not on the list while „ava" is. Without the second
   * guard, 671 Papavas and 364 პაპავას — a family `isNameToken` reads
   * correctly today — would have been read as somebody's grandfather.
   */
  it('leaves a family name that only looks like the word plus an ending', () => {
    for (const t of ['papava', 'პაპავა', 'papashvili', 'papadze', 'ბაბულია']) {
      expect(classifyToken(t, false)).toBe('name');
    }
  });

  /**
   * And the guard must not reach the case it was NOT written for: „ბებია" IS
   * the word, it ends in „ია", and the grandmother has to keep coming through.
   * That is what the length test in `matchesAnchored` is for.
   */
  it('does not take the grandmother back from the previous fix', () => {
    expect(classifyToken('ბებია', false)).toBe('relation');
    expect(classifyToken('bebia', false)).toBe('relation');
    expect(classifyToken('goris', false)).toBe('place');
    expect(classifyToken('dididze', false)).toBe('name');
  });

  it('reads the six new names and still refuses the car wash and the market', () => {
    for (const n of ['lizi', 'joni', 'barbare', 'eto', 'taso', 'sali', 'ლიზი', 'ჯონი']) {
      expect(classifyToken(n, false)).toBe('name');
    }
    // .11 and .02 lead share: a company behaving like one, not a name hiding.
    expect(classifyToken('saga', false)).toBe('organisation');
    expect(classifyToken('kidobani', false)).toBe('organisation');
  });
});
