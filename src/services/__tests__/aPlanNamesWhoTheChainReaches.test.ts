import { foundThroughFirstLinks, introTargetSentence } from '../introTargetSentence';

/**
 * 5347, the tester's 63867 (56039, 56043, 56049): the walk found Zurab and the
 * plan asked the chain's first link, Levan, yet the plan the owner read was only
 * „ლევან ჯაფარიძის ასისტენტს დაველაპარაკები და შევეცდები, ეს მოვაგვარო."
 */
describe('a plan through the first link of a far chain', () => {
  const levan = { name: 'ლევან ჯაფარიძე', phone: '995599000856' };
  const zurab = { name: 'ზურაბ ქობულაძე', firstLinkPhone: '995599000856' };

  it('names the person the chain reaches', () => {
    expect(introTargetSentence({}, [levan], 'ka', foundThroughFirstLinks([zurab]))).toBe(
      'ლევან ჯაფარიძის ასისტენტს დაველაპარაკები და შევეცდები მოვაგვარო, ' +
        'რომ ლევან ჯაფარიძემ გაგაცნოს ზურაბ ქობულაძე.',
    );
  });

  // #6899 fourth pass (tester 04:11Z): the sentence named the person by another account's label.
  it('names the person as the planned go-between saved them', () => {
    expect(
      introTargetSentence({}, [levan], 'ka', foundThroughFirstLinks([zurab]), 'ზურა მეგობარი'),
    ).toBe(
      'ლევან ჯაფარიძის ასისტენტს დაველაპარაკები და შევეცდები მოვაგვარო, ' +
        'რომ ლევან ჯაფარიძემ გაგაცნოს ზურა მეგობარი.',
    );
  });

  it('keeps the plain sentence when the chain starts at somebody else', () => {
    const elsewhere = { ...zurab, firstLinkPhone: '995599000999' };
    expect(introTargetSentence({}, [levan], 'ka', foundThroughFirstLinks([elsewhere]))).toBeNull();
  });

  it('keeps the plain sentence when two people are found through the same link', () => {
    const two = foundThroughFirstLinks([zurab, { ...zurab, name: 'ნოტარიუსი ქუთაისში' }]);
    expect(introTargetSentence({}, [levan], 'ka', two)).toBeNull();
  });

  it('drops a find with no name or no first link', () => {
    expect(
      foundThroughFirstLinks([
        { name: ' ', firstLinkPhone: '995599000856' },
        { name: 'ზურაბ', firstLinkPhone: '' },
      ]),
    ).toEqual([]);
  });
});
