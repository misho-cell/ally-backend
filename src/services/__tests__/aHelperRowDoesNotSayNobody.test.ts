import { SEE_HELPER_ON, withHelperSaid, type WorkedRow } from '../listItems.service';

/** NIGHT_QUESTIONS BE (4160 note b): „nobody / no route" beside a named helper read as a contradiction. */
const row = (wayIn: string, state: string): WorkedRow => ({
  row_data: ['ნინო', 'ბუღალტერი'],
  way_in: wayIn,
  through_whom: null,
  state,
  answer: null,
  columns: ['name', 'need'],
});
const cells = ['ნინო', 'ბუღალტერი', 'შენს კონტაქტებში არავინ', '', 'გზა არ არის', ''];

describe('a row whose need names a helper', () => {
  it('is unchanged until Misho says yes to the words', () => {
    expect(SEE_HELPER_ON).toBe(false);
    expect(withHelperSaid(cells, row('none', 'no_route'), 'ka')).toEqual(cells);
  });

  it('points the way-in and state cells at the helper, once on', () => {
    expect(withHelperSaid(cells, row('none', 'no_route'), 'ka', true)).toEqual([
      'ნინო',
      'ბუღალტერი',
      'იხ. დამხმარე',
      '',
      'იხ. დამხმარე',
      '',
    ]);
  });

  it('leaves a row with a real way in, and a state that is not „no route", as they are', () => {
    expect(withHelperSaid(cells, row('first_circle', 'route_found'), 'ka', true)).toEqual(cells);
    expect(withHelperSaid(cells, row('none', 'unchecked'), 'ka', true)[4]).toBe('გზა არ არის');
  });
});
