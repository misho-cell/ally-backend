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

/** Tester 40162: „and will be able to help" added to a name-only answer. */
describe('a promise of help the helper did not make', () => {
  it('is found', () => {
    expect(
      endorsementAdded('ნანა სტომატოლოგი', 'ასახელებს ნანას, სტომატოლოგს, და დაგეხმარება.'),
    ).toEqual(['დაგეხმარება']);
    expect(
      endorsementAdded('Nana, a dentist', 'They name Nana, a dentist, who will help.'),
    ).toEqual(['help']);
  });

  it('is kept when the helper offered it', () => {
    expect(
      endorsementAdded('ნანა სტომატოლოგი, დაგეხმარება', 'ასახელებს ნანას, ის დაგეხმარება.'),
    ).toEqual([]);
  });
});

/** Tester 40229: „ნინოს, პედიატრს, მირჩევს" for a name-only answer. */
describe('a recommending verb in any person', () => {
  it('is found when the helper wrote only a name', () => {
    expect(endorsementAdded('ნინო პედიატრი', 'ნინოს, პედიატრს, მირჩევს.')).toEqual(['მირჩევს']);
  });
});
