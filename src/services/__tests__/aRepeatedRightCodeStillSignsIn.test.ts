/**
 * Misho's video, 23 Oct 17:40Z: the keyboard filled the WhatsApp code, the page
 * posted it and Verify was tapped too. The first post spent the code; the
 * second said „wrong or has expired" over the way back to Claude.
 */
import { REPEAT_GRACE_MS, rememberAcceptedCode, wasJustAccepted } from '../connectorCodeRepeat';

const PHONE = '+995500000001';
const START = 1_000_000;

describe('a code the sign-in page just accepted', () => {
  it('is accepted again for the same number within the grace', () => {
    rememberAcceptedCode(PHONE, '111111', START);
    expect(wasJustAccepted(PHONE, '111111', START + 5_000)).toBe(true);
  });

  it('matches the number however it is written', () => {
    rememberAcceptedCode(PHONE, '222222', START);
    expect(wasJustAccepted('995 500 000 001', '222222', START + 1_000)).toBe(true);
  });

  it('is not a pass for another code or another number', () => {
    rememberAcceptedCode(PHONE, '333333', START);
    expect(wasJustAccepted(PHONE, '333334', START + 1_000)).toBe(false);
    expect(wasJustAccepted('+995500000002', '333333', START + 1_000)).toBe(false);
  });

  it('runs out after the grace', () => {
    rememberAcceptedCode(PHONE, '444444', START);
    expect(wasJustAccepted(PHONE, '444444', START + REPEAT_GRACE_MS + 1)).toBe(false);
  });

  it('never matches an empty code', () => {
    expect(wasJustAccepted(PHONE, '', START)).toBe(false);
  });
});
