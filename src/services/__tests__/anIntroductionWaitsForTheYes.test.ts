import { readFileSync } from 'fs';
import { join } from 'path';
import { IntroGateFacts, introductionMayGo } from '../introYesGate';

const none: IntroGateFacts = {
  permissionGranted: false,
  approvedPlanNamesThem: false,
  passesARequestOn: false,
  ownerLines: ['კარგი ელექტრიკოსი მჭირდება ვაკეში'],
  mediatorName: 'ლიკა ოსეფაშვილი',
};

/** #8946 (battery 5 Nov, case 8 run 3): an introduction went out before the owner's yes. */
describe('#8946: an introduction goes only on the owner’s word', () => {
  it('is held inside a search run, before any yes', () => {
    expect(introductionMayGo(none)).toBe(false);
  });

  it('goes on the goal’s permission or an approved plan naming the go-between', () => {
    expect(introductionMayGo({ ...none, permissionGranted: true })).toBe(true);
    expect(introductionMayGo({ ...none, approvedPlanNamesThem: true })).toBe(true);
  });

  it('goes when the owner named the go-between himself, in any case ending', () => {
    expect(introductionMayGo({ ...none, ownerLines: ['ლიკას სთხოვე გამაცნოს'] })).toBe(true);
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
