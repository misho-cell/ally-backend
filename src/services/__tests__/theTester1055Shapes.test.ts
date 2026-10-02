import { withoutStrayGeorgianCapitals } from '../georgianCapitals';
import { STAGE_DIRECTION_ONLY_RE } from '../chat.service';

/** The tester's 1055, thread 31058 (#167 reopened). */
describe('a bracketed final with a full stop after it', () => {
  it('is still only a stage direction, so the step is promoted', () => {
    expect(STAGE_DIRECTION_ONLY_RE.test('(აირჩიე რომელი შეესაბამება შენს სურვილს).')).toBe(true);
    expect(STAGE_DIRECTION_ONLY_RE.test('[waiting for the owner]!')).toBe(true);
  });

  it('leaves a sentence with a bracket inside it alone', () => {
    expect(STAGE_DIRECTION_ONLY_RE.test('ნინომ უპასუხა (კაბინეტი 7). გეყოფა?')).toBe(false);
  });
});

describe('a stray Georgian capital letter', () => {
  it('is lowered when it is glued to ordinary letters', () => {
    expect(withoutStrayGeorgianCapitals('Ნეტაი Test 170, პასუხი')).toBe('ნეტაი Test 170, პასუხი');
  });

  it('leaves a word written wholly in capitals alone', () => {
    expect(withoutStrayGeorgianCapitals('ᲛᲗᲐᲕᲐᲠᲘ')).toBe('ᲛᲗᲐᲕᲐᲠᲘ');
  });
});
