import {
  ArrivedAnswer,
  buildAnswersWakeEvent,
  buildShownAnswersWakeEvent,
  passedOnNote,
} from '../taskAsks.service';

/**
 * The tester's 1108 (33509 / 33496): the helper answered „ask Nino", their
 * assistant asked Nino at once, and the owner's run asked the same helper to
 * ask Nino himself. The owner's run is now told the question already went on.
 */
describe('an answer whose question was already passed on', () => {
  const bacho: ArrivedAnswer = {
    answer: 'არ ვიცი, მაგრამ ნინო დოლიძემ იცის. მას ჰკითხე.',
    fromName: 'ბაჩო კვარაცხელია',
    verbatim: true,
    passedOn: true,
  };
  const other: ArrivedAnswer = { answer: 'არ ვიცი.', fromName: 'ლაშა', verbatim: true };

  it('tells the owner’s run not to ask the helper again', () => {
    const note = passedOnNote([bacho]);
    expect(note).toContain('ბაჩო კვარაცხელია');
    expect(note).toContain('უკვე გადასცა');
    expect(note).toContain('იგივე აღარ სთხოვო');
  });

  it('says nothing when nobody passed anything on', () => {
    expect(passedOnNote([other])).toBe('');
  });

  it('rides on every kind of answer event', () => {
    expect(buildAnswersWakeEvent([bacho])).toContain('უკვე გადასცა');
    expect(buildAnswersWakeEvent([bacho, other])).toContain('უკვე გადასცა');
    expect(buildShownAnswersWakeEvent([bacho])).toContain('უკვე გადასცა');
    expect(buildShownAnswersWakeEvent([other])).not.toContain('უკვე გადასცა');
  });

  it('never names the onward person itself', () => {
    expect(passedOnNote([bacho])).not.toContain('ნინო');
  });
});
