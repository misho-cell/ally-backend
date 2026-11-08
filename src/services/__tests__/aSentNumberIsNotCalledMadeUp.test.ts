import { NUMBER_ALREADY_SENT, answerForTheRun } from '../introduction.service';
import { introOutcomeEvent } from '../taskEngine.events';

/**
 * Tester's report 8 Nov, C6: the run read the go-between's number as „[hidden]"
 * and told the owner the correct number it had just handed over was made up.
 */
describe('a number the server handed over', () => {
  const answer = 'კი, აი მამაჩემის ნომერი: 599 12 34 56';

  it('reaches the run as sent, never as a bare hidden number', () => {
    const forRun = answerForTheRun(answer, 'handed_over_off_netai');
    expect(forRun).toContain(NUMBER_ALREADY_SENT);
    expect(forRun).not.toContain('[hidden]');
    expect(forRun).not.toMatch(/\d{3} \d{2}/);
  });

  it('stays hidden when nothing was handed over', () => {
    const forRun = answerForTheRun(answer, 'not_found');
    expect(forRun).toContain('[hidden]');
    expect(forRun).not.toContain(NUMBER_ALREADY_SENT);
  });

  it('is said to be correct in the off-Netai note, in every language', () => {
    const note = introOutcomeEvent(
      'გია',
      true,
      'handed_over_off_netai',
      'გელა',
      false,
      { answer: null, mediatorInPlan: false },
      true,
    );
    expect(note.ka).toContain('სწორია');
    expect(note.en).toContain('it is correct');
    expect(note.ru).toContain('он верный');
    expect(note.es).toContain('es correcto');
  });
});

/** Tester's report 8 Nov, C2: after Lasha's e-mail reached the owner, the run still „waited". */
describe('a handover to someone not on Netai', () => {
  it('says there is nothing to wait for, never that the target has not answered', () => {
    const note = introOutcomeEvent(
      'ლაშა',
      true,
      'handed_over_off_netai',
      'გიორგი',
      false,
      { answer: null, mediatorInPlan: false },
      true,
    );
    expect(note.ka).toContain('ამ გზაზე აღარაფერს ველოდებით');
    expect(note.ka).not.toContain('ჯერ არაფერი უპასუხია');
    expect(note.en).toContain('nothing left to wait for');
    expect(note.ka).toContain('ნომერი ან');
  });
});
