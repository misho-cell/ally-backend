/**
 * Board #661: digits inside a web address were masked as a phone, which broke
 * the link (`…/posts/1[hidden]`, `…?lan=geo&`). An address keeps its digits;
 * an address that carries a phone number is still masked.
 */
import { scrubText, stripRedactionArtifactsForDisplay } from '../privacyScrub';

const FACEBOOK_POST = 'https://www.facebook.com/groups/remontisjgupi/posts/1234567890123456';
const YELL_PAGE = 'https://www.yell.ge/company.php?lan=geo&id=123456789012';

function shown(text: string): string {
  return stripRedactionArtifactsForDisplay(scrubText(text));
}

describe('a web address keeps its digits', () => {
  it('leaves a long post id whole', () => {
    expect(shown(`პოსტი (${FACEBOOK_POST}).`)).toBe(`პოსტი (${FACEBOOK_POST}).`);
  });

  it('leaves a long query id whole, and the words after it', () => {
    const reply = `გვერდი (${YELL_PAGE}).\n\nორივე შემთხვევაში`;
    expect(shown(reply)).toBe(reply);
  });

  it('still masks a phone written beside the link', () => {
    expect(scrubText(`დარეკე 597931277 (${YELL_PAGE})`)).toBe(`დარეკე [hidden] (${YELL_PAGE})`);
  });

  it('still masks the number inside a link whose job is a phone', () => {
    expect(scrubText('https://wa.me/995591951803')).toBe('https://wa.me/[hidden]');
    expect(scrubText('https://api.whatsapp.com/send?phone=995591951803')).toBe(
      'https://api.whatsapp.com/send?phone=[hidden]',
    );
    expect(scrubText('https://example.ge/call?tel=995591951803')).toBe(
      'https://example.ge/call?tel=[hidden]',
    );
  });

  it('still masks a bare phone with no link anywhere', () => {
    expect(scrubText('tel 555 65 99 44 and +995 591 951 803')).toBe('tel [hidden] and [hidden]');
  });
});
