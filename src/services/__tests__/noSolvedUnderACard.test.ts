import { readFileSync } from 'fs';
import { join } from 'path';
import { ALREADY_ON_CARD, isAnswerCardEvent, withoutEarlySolvedCard } from '../answerCardGuard';
import { buildShownAnswersWakeEvent, buildShownRelayAnswerWakeEvent } from '../taskAsks.service';

const solved = (label: string): boolean => /მოგვარ|solved/i.test(label);

/**
 * Tester 907 / D531: under the relay card the run asked „does this solve it?"
 * with „მოგვარებულია / ჯერ არა" — Test 74 had only agreed.
 */
describe('no „solved?" under an answers card', () => {
  it('recognises both card events, and only those', () => {
    const direct = `[მოვლენა] ${buildShownAnswersWakeEvent([{ answer: 'კი', fromName: 'A', verbatim: true }])}`;
    const relayed = `[მოვლენა] ${buildShownRelayAnswerWakeEvent('Test 74', 'Test 75')}`;
    expect(isAnswerCardEvent(direct)).toBe(true);
    expect(isAnswerCardEvent(relayed)).toBe(true);
    expect(isAnswerCardEvent('რა ხდება ჩემს მიზანზე?')).toBe(false);
    expect(isAnswerCardEvent(`ციტატა: ${ALREADY_ON_CARD}`)).toBe(false);
  });

  it('takes the finish card off, and replaces a reply that was only the question', () => {
    const guarded = withoutEarlySolvedCard(
      'გითხარი, ეს წყვეტს საკითხს?',
      ['მოგვარებულია', 'ჯერ არა'],
      'ka',
      solved,
    );
    expect(guarded).toEqual({
      text: 'როცა დარწმუნდები, რომ ეს გიშველის, მომწერე — მაშინ დავხურავ.',
      choices: undefined,
    });
  });

  it('keeps a real reply and the other buttons', () => {
    const text = 'Test 74 თანახმაა. გავუგზავნო გაცნობის თხოვნა?';
    const long = `${text} ${'დეტალი '.repeat(20)}`;
    const guarded = withoutEarlySolvedCard(
      long,
      ['გაცნობის თხოვნა გავუგზავნო', 'Solved', 'Not yet'],
      'en',
      solved,
    );
    expect(guarded?.text).toBe(long);
    expect(guarded?.choices).toEqual(['გაცნობის თხოვნა გავუგზავნო']);
  });

  it('leaves a reply with no finish card alone', () => {
    expect(withoutEarlySolvedCard('კარგი.', ['გაცნობის თხოვნა'], 'ka', solved)).toBeNull();
    expect(withoutEarlySolvedCard('კარგი.', undefined, 'ka', solved)).toBeNull();
  });

  it('is applied where the reply is assembled', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('isAnswerCardEvent(userMessage)');
    expect(chat).toContain(
      'withoutEarlySolvedCard(cleanedFinal, choices, language, isSolvedLabel)',
    );
  });
});

/** Tester 907: „write to Nino yourself" — the owner has no way to; the one who agreed introduces. */
describe('the next step under a relayed card', () => {
  const event = buildShownRelayAnswerWakeEvent('Netai Test 74', 'Netai Test 75');

  it('offers an introduction from the one who agreed, not a message the owner cannot send', () => {
    expect(event).toContain('request_introduction');
    expect(event).not.toContain('პირველი შეტყობინება თავად');
  });
});

/** Tester 909: a contact list ended on „Test 65 agreed to the introduction" — another thread's news. */
describe('one reply, one subject, in a thread without a goal too', () => {
  it('extends the 284 rule to threads that belong to no goal', () => {
    const rules = readFileSync(join(__dirname, '..', 'testerRules.ts'), 'utf8');
    expect(rules).toContain('in a thread that belongs to no goal');
  });
});

/** Tester 909: the reply to „later" is „I will check back in a day" — not a cliffhanger to nudge. */
describe('a later tap is not nudged into a second reply', () => {
  it('skips the cliffhanger guard when the person pressed „later"', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('askTapOf(lastUserText(messages)) === AskTap.Later');
    expect(chat).toContain(
      '    !answeringALaterTap &&\n    (claimedASendThatDidNotHappen ||\n      helperQuestionUnsent ||\n      answeredWithoutSearching ||\n      promisedWithoutActing ||\n      membersSkipped ||\n      isCliffhangerReply(finalText))',
    );
  });
});

/**
 * Tester 910: the glued „Netai Test 65 agreed…" was the server's own
 * instruction — the responded-requests section said to share it at the end
 * of the reply.
 */
describe('introduction answers in the prompt are context, not a footnote', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const section = chat.slice(chat.indexOf('function buildRespondedRequestsSection'));

  it('no longer tells the run to add them at the end of the reply', () => {
    expect(section.slice(0, 1500)).not.toContain('ეს პასუხის ბოლოს გაუზიარე');
  });

  it('says they are context, mentioned only when the owner asks', () => {
    expect(section.slice(0, 1500)).toContain('მხოლოდ კონტექსტი');
    expect(section.slice(0, 1500)).toContain('სხვა პასუხს ბოლოში არასდროს მიაწერო');
  });
});

/** The tester's 1121 (35436): the day and the place went with the question. */
describe('only the closing question is replaced', () => {
  const isSolved = (label: string): boolean => label === 'მოგვარებულია';

  it('keeps what the reply said before „solved?"', () => {
    const guarded = withoutEarlySolvedCard(
      'პარასკევს 12:00-ზე, ჭავჭავაძის 10-ში. მოგვარდა?',
      ['მოგვარებულია', 'ჯერ არა'],
      'ka',
      isSolved,
    );
    expect(guarded?.text).toBe(
      'პარასკევს 12:00-ზე, ჭავჭავაძის 10-ში. როცა დარწმუნდები, რომ ეს გიშველის, მომწერე — მაშინ დავხურავ.',
    );
  });

  it('still replaces a reply that was only the question', () => {
    const guarded = withoutEarlySolvedCard('მოგვარდა?', ['მოგვარებულია'], 'ka', isSolved);
    expect(guarded?.text).toBe('როცა დარწმუნდები, რომ ეს გიშველის, მომწერე — მაშინ დავხურავ.');
  });
});

/** The tester's 1123 (35739): „solved?" asked in words, with no buttons. */
describe('the finish question in words', () => {
  const isSolved = (label: string): boolean => label === 'მოგვარებულია';

  it('is replaced even with no buttons and a long reply', () => {
    const meeting =
      'ბესოსთან შეხვედრა უკვე დადგენილია: ხუთშაბათს 15:00-ზე, მის სახელოსნოში, გლდანი, ' +
      'დიაგნოსტიკა 30 ლარი ღირს. ჩათვალოთ ეს საკითხი მოგვარებულად?';
    const guarded = withoutEarlySolvedCard(meeting, undefined, 'ka', isSolved);
    expect(guarded?.text).toBe(
      'ბესოსთან შეხვედრა უკვე დადგენილია: ხუთშაბათს 15:00-ზე, მის სახელოსნოში, გლდანი, ' +
        'დიაგნოსტიკა 30 ლარი ღირს. როცა დარწმუნდები, რომ ეს გიშველის, მომწერე — მაშინ დავხურავ.',
    );
    expect(guarded?.choices).toBeUndefined();
  });

  it('leaves a different closing question alone', () => {
    expect(
      withoutEarlySolvedCard('გიას ვთხოვო გაცნობა?', ['კი', 'არა'], 'ka', isSolved),
    ).toBeNull();
  });
});
