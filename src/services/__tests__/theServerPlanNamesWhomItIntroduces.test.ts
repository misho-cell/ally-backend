import { planReplyText } from '../chat.service';
import {
  georgianSentence,
  INTRO_TARGET_SENTENCE_ON,
  introTargetSentence,
  plannedIntroduction,
} from '../introTargetSentence';

/**
 * 1454 (b), box 53498 run 2: the server's fallback „ლიკა მეხუთის ასისტენტს
 * დაველაპარაკები და შევეცდები, ეს მოვაგვარო." did not say whom it is about. The
 * plan's route already carries it (BF, §128); the sentence that names it is OFF
 * until Misho's yes on the text (NIGHT_QUESTIONS BQ).
 */
const LIKA = { name: 'ლიკა მეხუთე', phone: 'p-lika' };
const PLAN_INPUT = {
  routes: [
    {
      name: 'გაცნობა',
      status: 'waiting',
      introduction: { via_phone: 'p-lika', to_name: 'ნინუცა მეხუთე' },
    },
  ],
};

describe('the plan’s one introduction', () => {
  it('is the go-between and the person to meet', () => {
    expect(plannedIntroduction(PLAN_INPUT, [LIKA])).toEqual({
      via: 'ლიკა მეხუთე',
      to: 'ნინუცა მეხუთე',
      knowsThem: true,
    });
  });

  it('is none with two go-betweens, a go-between who cannot be asked, or no introduction', () => {
    expect(plannedIntroduction(PLAN_INPUT, [LIKA, { name: 'გია', phone: 'p-gia' }])).toBeNull();
    expect(plannedIntroduction(PLAN_INPUT, [{ ...LIKA, reach: 'not_member' }])).toBeNull();
    expect(plannedIntroduction({ routes: [{ name: 'x', status: 'waiting' }] }, [LIKA])).toBeNull();
  });

  it('is none when the routes through the go-between name two different people', () => {
    const two = {
      routes: [
        ...PLAN_INPUT.routes,
        { name: 'b', status: 'waiting', introduction: { via_phone: 'p-lika', to_name: 'სოფო' } },
      ],
    };
    expect(plannedIntroduction(two, [LIKA])).toBeNull();
  });
});

describe('the sentence (D739’s form)', () => {
  it('names the go-between in its cases and whom they introduce', () => {
    expect(georgianSentence({ via: 'ლიკა მეხუთე', to: 'ნინუცა მეხუთე' })).toBe(
      'ლიკა მეხუთის ასისტენტს დაველაპარაკები და შევეცდები მოვაგვარო, რომ ლიკა მეხუთემ გაგაცნოს ნინუცა მეხუთე.',
    );
  });

  it('is ON since Misho’s yes on the exact text (12 Oct)', () => {
    expect(INTRO_TARGET_SENTENCE_ON).toBe(true);
    // #5149 D (Misho's yes, 17 Oct): the sentence saying whom the go-between knows follows.
    expect(introTargetSentence(PLAN_INPUT, [LIKA], 'ka')).toBe(
      'ლიკა მეხუთის ასისტენტს დაველაპარაკები და შევეცდები მოვაგვარო, რომ ლიკა მეხუთემ გაგაცნოს ნინუცა მეხუთე. ' +
        'ლიკა მეხუთე ნინუცა მეხუთეს იცნობს.',
    );
  });
});

describe('the plan reply with the sentence', () => {
  const SERVER = 'ლიკა მეხუთის ასისტენტს დაველაპარაკები და შევეცდები, ეს მოვაგვარო.';
  const NAMED = georgianSentence({ via: 'ლიკა მეხუთე', to: 'ნინუცა მეხუთე' });
  const plan = { text: SERVER, names: ['ლიკა მეხუთე'], introSentence: NAMED };

  it('stands in for a reply without the plan', () => {
    expect(planReplyText('დამელოდე, სანამ დაადასტურებ.', plan, 'ka')).toBe(`${NAMED}\n\nდავიწყო?`);
  });

  it('leaves the model’s own clean sentence as it is', () => {
    const own = 'ლიკა მეხუთის ასისტენტს დაველაპარაკები და შევეცდები, ლიკამ გაგაცნოს ნინუცა.';
    expect(planReplyText(`${own}\n\nდავიწყო?`, plan, 'ka')).toBe(`${own}\n\nდავიწყო?`);
  });
});
