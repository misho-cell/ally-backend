import { readFileSync } from 'fs';
import { join } from 'path';
import { recommendsSomebody, refersSomebody } from '../referralRecommendation';

/** 3731 (IN-025, 2 of 2): the helper recommended her own contact, and that person heard nothing. */
const LINE = 'შემიძლია დაგაკავშირო. თამუნა მოგონილი ნოტარიუსია, ჩემი სახელით დაუკავშირდი.';

describe('recommendsSomebody', () => {
  it('reads a recommendation to get in touch, in Georgian and English', () => {
    expect(recommendsSomebody(LINE)).toBe(true);
    expect(recommendsSomebody('ნინოს მიწერე, ის გეტყვის')).toBe(true);
    expect(recommendsSomebody('Talk to Nino, she knows')).toBe(true);
  });

  it('is not a plain answer', () => {
    expect(recommendsSomebody('არ ვიცი, ბოდიში')).toBe(false);
    expect(recommendsSomebody('ვიცნობ ერთ ნოტარიუსს')).toBe(false);
  });
});

/** 3731 (box 52112, 0 of 2): the recommended person was asked before the helper's tap. */
describe('refersSomebody — no relay before the tap', () => {
  const BOX_LINE = 'კი, თამუნა მოგონილი ნოტარიუსია, ჩემი სახელით დაუკავშირდი.';

  it('is the tester line, an order to ask, and a recommendation', () => {
    expect(refersSomebody(BOX_LINE)).toBe(true);
    expect(refersSomebody('ჰკითხე ეკას, ის გეტყვის')).toBe(true);
    expect(refersSomebody('ნინოს მიწერე')).toBe(true);
  });

  it('is not a plain answer', () => {
    expect(refersSomebody('კი, ვიცნობ, ხვალ დაგირეკავს')).toBe(false);
    expect(refersSomebody('არ ვიცი')).toBe(false);
  });
});

/**
 * #8944 (battery 5 Nov): a helper's „კი, X, შემიძლია დაგაკავშირო" got the server's
 * „ვკითხო X-ს?" card in place of reaching the asker. No card is offered now, and
 * such a line keeps relay_ask.
 */
describe('#8944: a helper’s answer that names somebody', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('is never replaced by a server card', () => {
    expect(chat).not.toContain('offerReferral');
  });

  it('keeps relay_ask in an ask chat', () => {
    expect(chat).toContain("const relayHeld = ownerAbsent || thread.type !== 'incoming_ask';");
  });
});
