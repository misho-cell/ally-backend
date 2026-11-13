import { readFileSync } from 'fs';
import { join } from 'path';
import { IntroGateFacts, introductionMayGo } from '../introYesGate';

const none: IntroGateFacts = {
  passesARequestOn: false,
  approvedPlanIntroducesThem: false,
  approvedPlanNamesTheGoBetween: false,
  ownerSpokeSinceTheAnswer: false,
  ownerLines: ['კარგი ელექტრიკოსი მჭირდება ვაკეში'],
  replyTheOwnerAnswered: '',
  mediatorName: 'ლიკა ოსეფაშვილი',
  targetName: 'გიორგი ბერიძე',
};

/**
 * Alert 364 (a real member, 12 Nov): the owner said yes to a reply that offered
 * this very introduction, naming the go-between; he had to type a set sentence.
 */
describe('a yes to the introduction the reply offered', () => {
  const offered = 'ერეკლე ლევინგსტონი იცნობს გიორგი ბერიძეს. ვკითხო ერეკლეს, გაგაცნოს თუ არა?';

  it('goes when the owner answers it naming the go-between', () => {
    expect(
      introductionMayGo({
        ...none,
        mediatorName: 'Erekle Leavingstone',
        replyTheOwnerAnswered: offered,
        ownerLines: ['კი კითხე ერეკლესაც, რომპეტროლიც გვაინტერესებს'],
      }),
    ).toBe(true);
  });

  it('is held when the reply never named the person to be met', () => {
    expect(
      introductionMayGo({
        ...none,
        mediatorName: 'Erekle Leavingstone',
        replyTheOwnerAnswered: 'ერეკლეს ვკითხო, ვინმეს თუ იცნობს ლუკოილში?',
        ownerLines: ['კი კითხე ერეკლესაც'],
      }),
    ).toBe(false);
  });

  it('is held when the owner’s latest line moved on to something else', () => {
    expect(
      introductionMayGo({
        ...none,
        mediatorName: 'Erekle Leavingstone',
        replyTheOwnerAnswered: offered,
        // Newest first: the owner's latest line asks for other networks.
        ownerLines: ['სხვა ქსელები მომიძებნე', 'კი კითხე ერეკლესაც'],
      }),
    ).toBe(false);
  });

  /** Misho, 13 Nov: „კი" alone, to a reply that offered this introduction, is the yes. */
  it('goes on a plain „კი" to the reply that offered it', () => {
    expect(
      introductionMayGo({
        ...none,
        mediatorName: 'Erekle Leavingstone',
        replyTheOwnerAnswered: offered,
        ownerLines: ['კი'],
      }),
    ).toBe(true);
  });

  it('goes when the offer sits a few replies back and the last one only asks „shall I send?"', () => {
    expect(
      introductionMayGo({
        ...none,
        mediatorName: 'Erekle Leavingstone',
        replyTheOwnerAnswered: 'ერეკლეს მივწერო ამ ტექსტით?',
        recentReplies: ['ერეკლეს მივწერო ამ ტექსტით?', offered],
        ownerLines: ['კი'],
      }),
    ).toBe(true);
  });

  it('is held on „no", whatever was offered', () => {
    expect(
      introductionMayGo({
        ...none,
        mediatorName: 'Erekle Leavingstone',
        replyTheOwnerAnswered: offered,
        ownerLines: ['არა, ჯერ არ მინდა'],
      }),
    ).toBe(false);
  });
});

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

  it('goes when the owner named the person to be met and the go-between, in any case ending', () => {
    expect(
      introductionMayGo({ ...none, ownerLines: ['ლიკას სთხოვე, გიორგი ბერიძეს გამაცნოს'] }),
    ).toBe(true);
  });

  /** Tester's report 8 Nov, C4: „I want to meet Zura" sent the request through Irakli at once. */
  it('is held when the owner named only the person to be met, not the route', () => {
    expect(introductionMayGo({ ...none, ownerLines: ['გიორგი ბერიძის გაცნობა მინდა'] })).toBe(
      false,
    );
  });

  it('goes on the owner’s yes to a reply that showed the route', () => {
    expect(
      introductionMayGo({
        ...none,
        ownerLines: ['კი', 'გიორგი ბერიძის გაცნობა მინდა'],
        replyTheOwnerAnswered: 'გიორგი ბერიძეს ლიკა ოსეფაშვილი იცნობს. ლიკას ვთხოვო გაცნობა?',
      }),
    ).toBe(true);
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
    expect(chat).toContain(
      'passedOn === null\n          ? await introductionHasTheYes(threadId, goalForIntro, input, { userId, runId })\n          : IntroConsent.Yes;',
    );
    expect(chat).toContain('if (consent !== IntroConsent.Yes) {');
  });
});
