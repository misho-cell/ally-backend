import { readFileSync } from 'fs';
import { join } from 'path';
import { IntroGateFacts, introductionMayGo } from '../introYesGate';

const none: IntroGateFacts = {
  passesARequestOn: false,
  approvedPlanIntroducesThem: false,
  approvedPlanNamesTheGoBetween: false,
  ownerSpokeSinceTheAnswer: false,
  ownerLines: ['კარგი ელექტრიკოსი მჭირდება ვაკეში'],
  mediatorName: 'ლიკა ოსეფაშვილი',
  targetName: 'გიორგი ბერიძე',
};

/** #8946 (battery 5 Nov, case 8 run 3; retest 82842): an introduction went out before the owner's yes. */
describe('#8946: an introduction goes only on the owner’s word', () => {
  it('is held inside a search run, before any yes', () => {
    expect(introductionMayGo(none)).toBe(false);
  });

  it('is held when the owner named the go-between only to be asked, and said nothing since', () => {
    const askedOnly = {
      ...none,
      ownerLines: ['ლიკა ოსეფაშვილს ჰკითხე, იცნობს თუ არა ელექტრიკოსს'],
    };
    expect(introductionMayGo(askedOnly)).toBe(false);
  });

  /** Misho, 5 Nov: an approved plan is the delegation, and it covers the introduction. */
  it('goes through a go-between an approved plan asks, without asking again', () => {
    expect(introductionMayGo({ ...none, approvedPlanNamesTheGoBetween: true })).toBe(true);
  });

  it('goes when the owner answered after the answer and named the go-between', () => {
    expect(
      introductionMayGo({
        ...none,
        ownerSpokeSinceTheAnswer: true,
        ownerLines: ['ლიკას სთხოვე გამაცნოს'],
      }),
    ).toBe(true);
  });

  it('goes when the owner answered after the answer and an approved plan names the go-between', () => {
    expect(
      introductionMayGo({
        ...none,
        ownerSpokeSinceTheAnswer: true,
        approvedPlanNamesTheGoBetween: true,
      }),
    ).toBe(true);
  });

  it('goes when the owner named the person to be met, in any case ending', () => {
    expect(introductionMayGo({ ...none, ownerLines: ['გიორგი ბერიძეს გამაცანი'] })).toBe(true);
  });

  it('matches a go-between saved in Latin letters against the owner’s Georgian line', () => {
    expect(
      introductionMayGo({
        ...none,
        mediatorName: 'Lika Osepashvili',
        ownerSpokeSinceTheAnswer: true,
        ownerLines: ['კი, ლიკას სთხოვე'],
      }),
    ).toBe(true);
  });

  it('goes when an approved plan carries this introduction', () => {
    expect(introductionMayGo({ ...none, approvedPlanIntroducesThem: true })).toBe(true);
  });

  it('goes when it passes on a request the go-between was asked', () => {
    expect(introductionMayGo({ ...none, passesARequestOn: true })).toBe(true);
  });

  it('is wired before the send, and a request passed on skips it', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toMatch(
      /if \(passedOn === null && !\(await introductionHasTheYes\(threadId, goalForIntro, input\)\)\) \{\s+return \{ success: false, sent: false, error: INTRODUCTION_WAITS_FOR_THE_YES \};/,
    );
  });
});
