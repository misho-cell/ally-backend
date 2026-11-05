import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * #8944 (battery 5 Nov): a helper's „კი, X, შემიძლია დაგაკავშირო" got the server's
 * „ვკითხო X-ს?" card in place of reaching the asker. No card is offered now, and
 * such a line keeps relay_ask. (Moved from referralRecommendation.test.ts when
 * #8779 group 4 removed the recommendation word list.)
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
