import { cappedFuzzyTerms } from '../searchByTag';

/**
 * Ticket 20 row 108 — the fuzzy pass that has never run.
 *
 * Six timeouts out of six on 17 September, at 5 443-5 464 ms against a 5 000 ms
 * budget, each logging „pass did not run … (exact results stand)". So every tag
 * search paid five seconds for nothing. Measured on 501 against the live base:
 *
 *    3 terms     405 ms
 *    6 terms   2 179 ms
 *    8 terms   2 924 ms
 *   12 terms   4 462 ms   <- what the real queries carry
 */
const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
beforeEach(() => log.mockClear());
afterAll(() => log.mockRestore());

describe('cappedFuzzyTerms', () => {
  it('leaves a short list alone and says nothing', () => {
    const perWord = [['ფოტოგრაფი', 'fotografi', 'potograpi']];

    expect(cappedFuzzyTerms(perWord)).toEqual(['ფოტოგრაფი', 'fotografi', 'potograpi']);
    expect(log).not.toHaveBeenCalled();
  });

  it('gives EVERY word its own spelling before any word gets a second', () => {
    // This morning's lesson. A flat cut keeps every spelling of the first word
    // and drops the last word entirely — and in Georgian the last word is
    // usually the one naming the trade.
    const perWord = [
      ['ქორწილის', 'kortsilis', 'korcilis', 'qortsilis'],
      ['ფოტოგრაფის', 'fotografis', 'potograpis'],
      ['მომსახურება', 'momsakhureba', 'momsaxureba', 'momsaqhureba', 'momsahureba'],
    ];

    const kept = cappedFuzzyTerms(perWord);

    expect(kept).toHaveLength(6);
    // One of each word first, then round again.
    expect(kept.slice(0, 3)).toEqual(['ქორწილის', 'ფოტოგრაფის', 'მომსახურება']);
    expect(kept.slice(3)).toEqual(['kortsilis', 'fotografis', 'momsakhureba']);
  });

  it('never drops a word entirely while another word has a spare spelling', () => {
    const perWord = [
      ['ა', 'a', 'aa', 'aaa', 'aaaa', 'aaaaa', 'aaaaaa'],
      ['ბოლო', 'bolo'],
    ];

    expect(cappedFuzzyTerms(perWord)).toContain('ბოლო');
  });

  it('copes with words of unequal length without leaving holes', () => {
    const perWord = [['ერთი'], ['ორი', 'ori'], ['სამი', 'sami', 'samy']];

    const kept = cappedFuzzyTerms(perWord);

    expect(kept).toHaveLength(6);
    expect(new Set(kept).size).toBe(6);
  });

  it('says what it kept when it cuts', () => {
    cappedFuzzyTerms([
      ['ერთი', 'erti', 'ertti'],
      ['ორი', 'ori', 'orri'],
      ['სამი', 'sami', 'sammi'],
    ]);

    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain('9 variants over 3 word(s)');
  });

  it('answers with nothing for nothing', () => {
    expect(cappedFuzzyTerms([])).toEqual([]);
  });
});
