import { introAcceptedOpening } from '../introOpening';

/** #6603 (Giorgi's wording, G-122, 20 Oct): the target's message once the go-between agreed. */
describe('the target’s message after the go-between agreed', () => {
  it('says who asked whom, why, and that the number went over', () => {
    const text = introAcceptedOpening(
      'ka',
      'Davit Tsdiashvili',
      'გია ახალაძე',
      'საქმიანი თანამშრომლობა',
      true,
    );
    expect(text).toBe(
      'გია ახალაძე დაუკავშირდა დავით ცდიაშვილს და სთხოვა შენთან დაკავშირებაში შუამდგომლობა ' +
        'გაეწია. გია ახალაძეს სჭირდება შენი გაცნობა („საქმიანი თანამშრომლობა"). დავით ცდიაშვილი ' +
        'დათანხმდა გია ახალაძის დახმარებას და შენი ნომერი გადასცა, ალბათ თავად დაგიკავშირდება.',
    );
    expect(text).not.toContain('წიგნაკიდან');
    expect(text).not.toContain('შევაჩერებ');
  });

  it('still says so when no number went over', () => {
    const text = introAcceptedOpening('ka', 'ნინო', 'დათო', null, false);
    expect(text).toContain('დათოს სჭირდება შენი გაცნობა.');
    expect(text).toContain('შენი ნომერი არავის გადაცემია');
    expect(text).not.toContain('გადასცა, ალბათ');
  });
});
