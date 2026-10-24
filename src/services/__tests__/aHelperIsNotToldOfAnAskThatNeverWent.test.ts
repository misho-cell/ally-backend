import { readFileSync } from 'fs';
import { join } from 'path';
import { HELPER_ASKED_NOBODY_NUDGE, helperChatClaimsAnAskNobodyGot } from '../replyGuards';

/**
 * #7229 (tester 74779, helper chat 65053; Misho's yes, 24 Oct): „გიორგი
 * სანტექნიკოსის ასისტენტს კითხვა გავუგზავნე" — the run's one ask went to the
 * asker, and Giorgi is not a member.
 */
describe('an ask claimed in a helper’s own chat', () => {
  const tester65053 = 'გიორგი სანტექნიკოსის ასისტენტს კითხვა გავუგზავნე, მალე მოგწერ.';

  it('is false when the run asked somebody else (65053)', () => {
    expect(
      helperChatClaimsAnAskNobodyGot(tester65053, { asked: ['ნინო კაპანაძე'], anythingWent: true }),
    ).toBe(true);
  });

  it('is false when nothing went out at all', () => {
    expect(helperChatClaimsAnAskNobodyGot(tester65053, { asked: [], anythingWent: false })).toBe(
      true,
    );
  });

  it('is true when it names the person this run asked, in any case ending', () => {
    expect(
      helperChatClaimsAnAskNobodyGot(tester65053, {
        asked: ['გიორგი სანტექნიკოსი'],
        anythingWent: true,
      }),
    ).toBe(false);
  });

  it('leaves „I sent it" alone when the answer did go to the asker', () => {
    expect(
      helperChatClaimsAnAskNobodyGot('მადლობა, გავუგზავნე.', { asked: [], anythingWent: true }),
    ).toBe(false);
  });

  it('leaves a reply that claims no send alone', () => {
    expect(
      helperChatClaimsAnAskNobodyGot('გიორგი Netai-ზე არ არის.', {
        asked: [],
        anythingWent: false,
      }),
    ).toBe(false);
  });

  it('a refusal is not a claim', () => {
    expect(
      helperChatClaimsAnAskNobodyGot('გიორგის ვერ ვკითხე — ის Netai-ზე არ არის.', {
        asked: [],
        anythingWent: false,
      }),
    ).toBe(false);
  });
});

describe('the server asks once more, in the helper’s chat only', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('runs in incoming_ask threads and sends the approved note', () => {
    const guard = chat.slice(chat.indexOf('const claimedAHelperAskNobodyGot'));
    expect(guard.slice(0, 700)).toContain("runModes.get(runId) === 'incoming_ask'");
    expect(chat).toContain('? HELPER_ASKED_NOBODY_NUDGE');
    expect(HELPER_ASKED_NOBODY_NUDGE).toContain('ბოდიშის გარეშე');
  });
});
