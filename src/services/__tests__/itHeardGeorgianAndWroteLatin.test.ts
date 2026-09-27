import { heardGeorgianButWroteLatin } from '../speech.service';

/**
 * ROW 226 — IT HEARD GEORGIAN AND WROTE IT IN THE LATIN ALPHABET.
 *
 * The tester's 21-second clip came back as Latin transliteration, partly
 * distorted. That text is not an answer and it is not a failure either: it
 * goes into a run as if it were the person's own words, and what reaches them
 * is nonsense built on nonsense. „I could not hear you" is a sentence somebody
 * can act on. A garbled transliteration is not.
 *
 * ⚠️ THIS DOES NOT FIX 226 AND IS NOT OFFERED AS ONE. The model still has to
 * be chosen and that choice is not mine — I have no key, no voice of my own to
 * test with, and naming a model would be a guess about a person's voice, which
 * this row has already survived twice. What this does is stop the broken half
 * reaching a person while the choice is made.
 *
 * THE TEST IS THE RECOGNISER'S OWN ANSWER, NEVER THE PHONE'S CLAIM, and that
 * is the whole design. `transcribe` already has a comment explaining that
 * `language` used to echo the caller's hint straight back, so the field
 * answered „ka" to „was this Georgian?" purely because the handset said so —
 * „a field that cannot disagree with its input is not an answer". Judging a
 * transcript by the hint would rebuild exactly that, and it would refuse a
 * person who simply spoke English on a phone set to Georgian.
 */
const A_GEORGIAN_SENTENCE = 'გამარჯობა, მჭირდება კარგი ექიმი';

/** What the tester actually got back: Georgian speech, Latin letters. */
const THE_SAME_THING_IN_LATIN = 'gamarjoba, mchirdeba kargi eqimi';

describe('a Georgian transcript written in the wrong alphabet', () => {
  it('is caught when the recogniser itself says it heard Georgian', () => {
    expect(heardGeorgianButWroteLatin(THE_SAME_THING_IN_LATIN, 'georgian')).toBe(true);
  });

  it('is caught whichever way the recogniser names the language', () => {
    expect(heardGeorgianButWroteLatin(THE_SAME_THING_IN_LATIN, 'ka')).toBe(true);
    expect(heardGeorgianButWroteLatin(THE_SAME_THING_IN_LATIN, 'KA')).toBe(true);
    expect(heardGeorgianButWroteLatin(THE_SAME_THING_IN_LATIN, 'ka-GE')).toBe(true);
  });

  it('leaves a proper Georgian transcript alone', () => {
    expect(heardGeorgianButWroteLatin(A_GEORGIAN_SENTENCE, 'georgian')).toBe(false);
  });
});

describe('what it must not refuse', () => {
  /**
   * The false positive that would matter: somebody speaking English on a phone
   * set to Georgian. The recogniser says English, so nothing here applies —
   * which is why the rule reads its answer and not the handset's.
   */
  it('passes an English sentence the recogniser calls English', () => {
    expect(heardGeorgianButWroteLatin('I need a good doctor', 'english')).toBe(false);
    expect(heardGeorgianButWroteLatin('I need a good doctor', 'en')).toBe(false);
  });

  /**
   * And when the recogniser said NOTHING, nothing is refused. Some response
   * formats carry no language at all, and a silent field is not evidence.
   */
  it('refuses nothing when the recogniser did not say what it heard', () => {
    expect(heardGeorgianButWroteLatin(THE_SAME_THING_IN_LATIN, undefined)).toBe(false);
    expect(heardGeorgianButWroteLatin(THE_SAME_THING_IN_LATIN, '')).toBe(false);
  });

  /**
   * A MAJORITY, NOT A PRESENCE — the same rule row 260's translation wall
   * settled on, for the same reason. A Georgian sentence carrying a Latin name
   * or a brand is still Georgian.
   */
  it('passes a Georgian sentence with a Latin name in it', () => {
    expect(heardGeorgianButWroteLatin('დამირეკე Netai-ზე ხვალ დილით', 'ka')).toBe(false);
  });

  it('passes a Georgian sentence with a number and a Latin word', () => {
    expect(heardGeorgianButWroteLatin('მჭირდება 3 მშენებელი Vake-ში', 'ka')).toBe(false);
  });
});
