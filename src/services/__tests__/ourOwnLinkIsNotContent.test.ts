import { withoutOwnLinks } from '../moderation.service';

/**
 * 29 September, 19:31–19:33 UTC: the founder asked for his own invite link and
 * two replies in a row were blocked — `category=harassment`, then
 * `category=dangerous` — before the third went through. Three paid runs for one
 * URL the server itself had minted.
 *
 * Our own link cannot be the unsafe part of a reply, so it is masked for the
 * classifier's vote only. These tests pin both halves: our links are hidden
 * from the vote, and nothing else is.
 */
describe('our own link is not content', () => {
  it('masks the invite link the founder was trying to send', () => {
    const reply = 'აი შენი ბმული: https://www.netai.guru/join?ref=AB12CD — გაუგზავნე მეგობარს.';

    const judged = withoutOwnLinks(reply);

    expect(judged).not.toContain('join?ref');
    expect(judged).not.toContain('AB12CD');
    expect(judged).toContain('[netai link]');
    // The words around it are still judged exactly as written.
    expect(judged).toContain('გაუგზავნე მეგობარს');
  });

  it('masks it with or without the scheme and www', () => {
    expect(withoutOwnLinks('netai.guru/join?ref=X')).toBe('[netai link]');
    expect(withoutOwnLinks('http://netai.guru/pricing')).toBe('[netai link]');
    expect(withoutOwnLinks('HTTPS://WWW.NETAI.GURU/chat')).toBe('[netai link]');
  });

  /**
   * ⚠️ NARROW ON PURPOSE. A link to anywhere else is precisely what a safety
   * check should look at, so it must reach the classifier untouched.
   */
  it('leaves every other link for the classifier to judge', () => {
    const reply = 'see https://evil.example/login and https://netai.guru.evil.example/x';

    const judged = withoutOwnLinks(reply);

    expect(judged).toContain('https://evil.example/login');
    // A lookalike domain is not ours and is not masked.
    expect(judged).toContain('netai.guru.evil.example');
  });

  /** Our domain appearing inside someone else's path is still their link. */
  it('does not mask our domain when it sits inside another URL', () => {
    const reply = 'open https://evil.example/netai.guru/login now';

    expect(withoutOwnLinks(reply)).toBe(reply);
  });

  it('leaves a reply with no link exactly as it was', () => {
    const reply = 'ჯერ ვეძებ იურისტს შენს კონტაქტებში.';
    expect(withoutOwnLinks(reply)).toBe(reply);
  });
});
