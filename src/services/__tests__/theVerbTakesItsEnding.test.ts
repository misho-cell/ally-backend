import { instructionAddressee, instructionNamed } from '../goalIntent';

/**
 * 2311 (the tester's 56799, CE 0 of 5): the verb's own ending was read as the
 * first word of the name, so the go-between was never found.
 */
describe('the name after an instruction verb', () => {
  it.each([
    ['სთხოვე გიორგი ხიდაძეს, დამაკავშიროს ნინო მიზნაძესთან.', 'გიორგი ხიდაძე'],
    ['თხოვე გიორგი ხიდაძეს, დამაკავშიროს ნინო მიზნაძესთან.', 'გიორგი ხიდაძე'],
    ['მისწერე ლევან საცდელს, ხომ არ იცის სანტექნიკოსი.', 'ლევან საცდელ'],
    ['უთხარი ნინო გამოგონილს, რომ ხვალ მოვალ.', 'ნინო გამოგონილ'],
  ])('„%s" names „%s", with no letter of the verb', (line, name) => {
    expect(instructionNamed(line)).toBe(name);
    expect((instructionAddressee(line) ?? '').split(' ')[0]).toBe(name.split(' ')[0]);
  });
});
