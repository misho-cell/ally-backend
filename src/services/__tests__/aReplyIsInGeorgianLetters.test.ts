import { foreignWordInReply, foreignWordNudge } from '../buttonLetters';

/**
 * 5347, the tester's 63930 (56071): a Georgian reply ended „…? համաձայն ხარ" —
 * Armenian for „agree".
 */
describe('a word in the reply in letters a Georgian reader cannot read', () => {
  it('is caught, Armenian or old script', () => {
    expect(
      foreignWordInReply('ვკითხო ლევანის ასისტენტს? համաձայն ხარ?', 'მჭირდება ნოტარიუსი'),
    ).toBe('համաձայն');
    expect(foreignWordInReply('დიაႮ, გავაგზავნი', '')).toBe('დიაႮ,');
  });

  it('is left alone when the owner wrote it himself', () => {
    expect(foreignWordInReply('ვკითხავ Արամ-ს', 'ჰკითხე Արամ-ს ნოტარიუსი')).toBeNull();
  });

  it('finds nothing in an ordinary reply', () => {
    expect(foreignWordInReply('ლევანის ასისტენტს დაველაპარაკები. თანახმა ხარ?', '')).toBeNull();
  });

  it('names the word in the turn that has the reply written again', () => {
    expect(foreignWordNudge('համաձայն')).toContain('„համաձայն"');
  });
});
