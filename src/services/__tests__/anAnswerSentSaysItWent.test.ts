import { readFileSync } from 'fs';
import { join } from 'path';
import { withAnswerSentLine, withAnswerSentLineOnce } from '../similarAnswerRule';
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
    // #6766: once per conversation.
    expect(chat).toContain('effectiveFinal = withAnswerSentLineOnce(');
    expect(chat).toContain('await answerSentAlreadySaid(threadId),');
    const clear = chat.slice(chat.indexOf('function clearRunState'));
    expect(clear.slice(0, 1400)).toContain('runAnswerSent.delete(runId)');
  });
});

/** #6766 (Giorgi, helper's screen 20 Oct): the line once per conversation. */
describe('the answer-sent line, said once', () => {
  it('is said the first time', () => {
    expect(withAnswerSentLineOnce('', 'ka', false)).toBe('მადლობა, პასუხი გაიგზავნა.');
  });

  it('is not said again: a reply that was only the line goes quiet, any other reply stands', () => {
    expect(withAnswerSentLineOnce('', 'ka', true)).toBe('');
    expect(withAnswerSentLineOnce('პასუხი გაიგზავნა.', 'ka', true)).toBe('');
    expect(withAnswerSentLineOnce('კარგი, გადავეცი.', 'ka', true)).toBe('კარგი, გადავეცი.');
  });
});

/** Tester #29 (box 70135): „პასუხი გაიგზავნა. პასუხის გაგზავნას ვერ ვადასტურებ." */
describe('a reply that doubts the answer went', () => {
  it('loses the doubting sentence: the server knows the answer went', () => {
    expect(withAnswerSentLine('პასუხის გაგზავნას ვერ ვადასტურებ. კიდევ რამე?', 'ka')).toBe(
      'პასუხი გაიგზავნა. კიდევ რამე?',
    );
    expect(withAnswerSentLine('პასუხის გაგზავნას ვერ ვადასტურებ.', 'ka')).toBe(
      'მადლობა, პასუხი გაიგზავნა.',
    );
    expect(withAnswerSentLine("I can't confirm it was sent. Anything else?", 'en')).toBe(
      'Your answer was sent. Anything else?',
    );
  });

  it('leaves a reply that does not doubt it alone', () => {
    expect(withAnswerSentLine('კარგი, გავუგზავნე.', 'ka')).toBe('კარგი, გავუგზავნე.');
  });
});

/** #7459 (Iro, 64087): a second answer in the same conversation is confirmed too. */
describe('the answer-sent line, after another reply', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const lookup = chat.slice(chat.indexOf('async function answerSentAlreadySaid('));
  const body = lookup.slice(0, lookup.indexOf('\n}\n'));

  it('is skipped only when the assistant’s last line already was it', () => {
    expect(body).toContain('ORDER BY c.created_at DESC');
    expect(body).toContain('LIMIT 1');
    expect(body).toContain("AND c.content <> ''");
    expect(body).not.toContain('SELECT EXISTS');
  });
});
