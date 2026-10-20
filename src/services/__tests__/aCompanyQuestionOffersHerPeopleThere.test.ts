jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { brandNamedIn } from '../brandAliases';
import { needFromQuestion } from '../bridgePicker';

/** #6238 (the tester's 61942–44): a question about a company offers the helper her people there. */
describe('a question that names a company', () => {
  it('reads the company as the need, in every way the card wrote it', () => {
    expect(needFromQuestion('ვის იცნობ TBC-ში, ვინც სესხის საკითხს მოაგვარებს?')).toEqual({
      need: 'TBC',
    });
    expect(needFromQuestion('ვის იცნობ TBC ბანკში, ვინც დაეხმარება?')).toEqual({ need: 'TBC' });
    expect(
      needFromQuestion('სესხი გაუჭედა TBC-ში და ვინმე სჭირდება, იცნობ ასეთ ადამიანს?'),
    ).toEqual({ need: 'TBC' });
    expect(needFromQuestion('ვინმეს იცნობ თიბისიში?')).toEqual({ need: 'თიბისიში' });
  });

  it('leaves a trade question as it was', () => {
    expect(needFromQuestion('იცნობ თუ არა კარგ სანტექნიკოსს?')).toEqual({ need: 'სანტექნიკოსი' });
  });

  it('finds no company where none is named', () => {
    expect(brandNamedIn('იცნობ კარგ ბუღალტერს?')).toBeNull();
    expect(brandNamedIn('ვინ არის ტექნიკოსი?')).toBeNull();
  });
});
