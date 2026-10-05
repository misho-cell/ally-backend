import { endorsementAdded, endorsementAddedRefusal } from '../helpersVoice';

/** #1488: „ნანა სტომატოლოგი" became „კარგი სტომატოლოგია ნანა, მას ვურჩევ". */
describe('praise the helper did not write', () => {
  it('is found when the helper typed only a name and a profession', () => {
    expect(endorsementAdded('ნანა სტომატოლოგი', 'კარგი სტომატოლოგია ნანა, მას ვურჩევ.')).toEqual([
      'კარგი',
      'ვურჩევ',
    ]);
  });

  it('is not found when the helper said it', () => {
    expect(endorsementAdded('ნანა კარგი სტომატოლოგია', 'ნანა კარგი სტომატოლოგია.')).toEqual([]);
    expect(
      endorsementAdded('I recommend Nana, a dentist', 'They recommend Nana, a dentist.'),
    ).toEqual([]);
  });

  it('is not found in a plain third-person report', () => {
    expect(endorsementAdded('ნანა სტომატოლოგი', 'ლიკამ დაასახელა ნანა, სტომატოლოგი.')).toEqual([]);
  });

  it('is refused with the words named', () => {
    expect(endorsementAddedRefusal(['კარგი'])).toContain('„კარგი"');
  });
});
