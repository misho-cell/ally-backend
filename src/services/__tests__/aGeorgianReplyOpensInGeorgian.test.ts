import { withoutLeadingInterjection } from '../leadingSelfNote';

/** The tester's 44223 (42164): „Good, დავადასტურე: …" opened a Georgian reply. */
describe('a Georgian reply', () => {
  it.each([
    ['Good, დავადასტურე: გაცნობა მიღებულია.', 'დავადასტურე: გაცნობა მიღებულია.'],
    ['OK — ვკითხე ნინოს.', 'ვკითხე ნინოს.'],
    ['Done! მზადაა.', 'მზადაა.'],
  ])('drops the English opener in „%s"', (reply, expected) => {
    expect(withoutLeadingInterjection(reply, 'ka')).toBe(expected);
  });

  it.each([
    'Google-ში ვიპოვე სამი სტუდია.',
    'Goodwill ბანკი ახლოსაა.',
    'Good Food Bar — თბილისი, ვაკე.',
    'დავადასტურე.',
  ])('keeps „%s" as written', (reply) => {
    expect(withoutLeadingInterjection(reply, 'ka')).toBe(reply);
  });

  it('leaves an English reply alone', () => {
    expect(withoutLeadingInterjection('Good, I asked Nino.', 'en')).toBe('Good, I asked Nino.');
  });
});
