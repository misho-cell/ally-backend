import { buildMeaningWordGroups } from '../transliterate';

const latin = (query: string): string[][] =>
  buildMeaningWordGroups(query).map((group) => group.map((t) => t.toLowerCase()));

/** The tester's 69015 / 69025 / 69026: Georgian questions missed people saved in English. */
describe('a Georgian question reaches a label saved in English', () => {
  it('„რკინიგზის ფინანსური დირექტორი" searches railway, CFO and director', () => {
    const [railway, finance, director] = latin('რკინიგზის ფინანსური დირექტორი');
    expect(railway).toContain('railway');
    expect(finance).toEqual(expect.arrayContaining(['cfo', 'financial', 'finance']));
    expect(director).toContain('director');
  });

  it('„ეკონომიკის სამინისტროს მოადგილე" searches economy, ministry and deputy', () => {
    const [economy, ministry, deputy] = latin('ეკონომიკის სამინისტროს მოადგილე');
    expect(economy).toContain('economy');
    expect(ministry).toContain('ministry');
    expect(deputy).toContain('deputy');
  });

  it('#6403: „ვეტერინარი" reaches a label saved „ცხოველების ექიმი", and the other way', () => {
    expect(buildMeaningWordGroups('ვეტერინარი')[0]).toEqual(
      expect.arrayContaining(['ცხოველ', 'tskhovel']),
    );
    expect(buildMeaningWordGroups('ცხოველების ექიმი')[0]).toEqual(
      expect.arrayContaining(['ვეტერინარ', 'veterinar']),
    );
  });

  it('keeps each English word as written, with no Georgian reading of it', () => {
    expect(buildMeaningWordGroups('რკინიგზა').flat()).not.toContain('რაილვაი');
  });
});
