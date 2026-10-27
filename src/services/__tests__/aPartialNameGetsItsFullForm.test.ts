import { isPartialName, mostCommonFullForm } from '../fullNameFromLabels';

/** #7728 (tester's engagement desk C-0020, 25 Oct). */
describe('a newcomer registered with a partial name', () => {
  it('is one word or lower case', () => {
    expect(isPartialName('Giorgi')).toBe(true);
    expect(isPartialName('okromchedlishvili')).toBe(true);
    expect(isPartialName('kakha beridze')).toBe(true);
    expect(isPartialName('Kakha Beridze')).toBe(false);
  });

  it('gets the full form most savers wrote, in either script, holding the registered word', () => {
    const labels = [
      'გიორგი ბერიძე',
      'Giorgi Beridze',
      'გიორგი ბერიძე',
      'Giorgi TBC',
      'Gio',
      'Giorgi B. (gym)',
      'მამა',
    ];
    expect(mostCommonFullForm(labels, 'Giorgi')).toBe('გიორგი ბერიძე');
  });

  it('gets nothing when no saver wrote a clean full name', () => {
    expect(mostCommonFullForm(['Gio', 'Giorgi B.', 'Kakha Beridze'], 'Giorgi')).toBeNull();
  });

  it('reads a short form of the registered name as the same name (matsi → Matsatso)', () => {
    expect(mostCommonFullForm(['Matsatso Papava', 'Papava'], 'matsi papava')).toBe(
      'Matsatso Papava',
    );
    expect(mostCommonFullForm(['Mariam Papava'], 'matsi papava')).toBeNull();
  });

  it('prefers a fuller form to more savers repeating the registered name (#7728 retest)', () => {
    const labels = ['matsi papava', 'Matsi Papava', 'matsi papava', 'Matsatso Papava'];
    expect(mostCommonFullForm(labels, 'matsi papava')).toBe('Matsatso Papava');
    expect(mostCommonFullForm(['matsi papava'], 'matsi papava')).toBe('matsi papava');
  });
});
