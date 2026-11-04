import { verifyTokenMatches } from '../whatsappInbound.service';

/** Misho's WhatsApp test (4 Nov): the verify token „did not match" though it looked the same. */
describe('the WhatsApp verify token', () => {
  it('matches across a copied space or line break', () => {
    expect(verifyTokenMatches('abc123', 'abc123')).toBe(true);
    expect(verifyTokenMatches('abc123\n', ' abc123 ')).toBe(true);
  });

  it('still refuses a different, empty or unset token', () => {
    expect(verifyTokenMatches('abc123', 'abc124')).toBe(false);
    expect(verifyTokenMatches('abc123', '')).toBe(false);
    expect(verifyTokenMatches(undefined, 'abc123')).toBe(false);
    expect(verifyTokenMatches('   ', '')).toBe(false);
  });
});
