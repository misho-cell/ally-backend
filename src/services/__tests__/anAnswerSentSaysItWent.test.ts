import { readFileSync } from 'fs';
import { join } from 'path';
import { withAnswerSentLine } from '../similarAnswerRule';
import { answerSentNote } from '../chat.service';

const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

/**
 * D562 (Tornike, 1 October; amends D527): the „answer similar ones like this"
 * button is gone, with the path that saved a rule on its tap. After a typed
 * answer goes, only „პასუხი გაიგზავნა." stays.
 */
describe('after an answer goes', () => {
  it('the run is told to say it went, in one line, with no button', () => {
    const note = answerSentNote('ka');
    expect(note).toContain('„პასუხი გაიგზავნა."');
    expect(note).toContain('no buttons');
    expect(chat).toContain('next: answerSentNote(runLang(runId))');
  });

  it('no rule button is offered and no tap saves a rule', () => {
    expect(chat).not.toContain('SIMILAR_RULE_LABEL');
    expect(chat).not.toContain('saveSimilarRuleOnTap');
    expect(chat).not.toContain('offer_rule');
    expect(chat).toContain('[tappedContext, approvedByTap, openAsksSettled, introAccepted]');
  });
});

/** The tester's 962: the line after the send said only „თუ გსურს, შეგიძლია აირჩიო.". */
describe('the reply after the send says the answer went', () => {
  it('opens with the line when the reply does not say it', () => {
    expect(withAnswerSentLine('თუ გსურს, შეგიძლია აირჩიო.', 'ka')).toBe(
      'პასუხი გაიგზავნა. თუ გსურს, შეგიძლია აირჩიო.',
    );
    // The tester's 1102 (E4): the line alone thanks the helper.
    expect(withAnswerSentLine('', 'en')).toBe('Thank you — your answer was sent.');
    expect(withAnswerSentLine('', 'ka')).toBe('მადლობა, პასუხი გაიგზავნა.');
    // 1103 (33157): the model wrote the bare line itself.
    expect(withAnswerSentLine('პასუხი გაიგზავნა.', 'ka')).toBe('მადლობა, პასუხი გაიგზავნა.');
  });

  it('adds nothing when the reply already says it went', () => {
    const said = 'პასუხი გავუგზავნე Netai Test 108-ს.';
    expect(withAnswerSentLine(said, 'ka')).toBe(said);
    expect(withAnswerSentLine('Sent it to Netai Test 108.', 'en')).toBe(
      'Sent it to Netai Test 108.',
    );
  });

  it('is applied to the final reply of a run whose answer went', () => {
    expect(chat).toContain('if (sent.sent && runId) runAnswerSent.add(runId);');
    expect(chat).toContain(
      'effectiveFinal = withAnswerSentLine(withoutQuotedCopy(effectiveFinal), language);',
    );
    const clear = chat.slice(chat.indexOf('function clearRunState'));
    expect(clear.slice(0, 1400)).toContain('runAnswerSent.delete(runId)');
  });
});
