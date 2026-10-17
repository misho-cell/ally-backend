import { readFileSync } from 'fs';
import { join } from 'path';
import { sentSentenceForOwner } from '../askState';

/**
 * The tester's 64285 (G-066 B, 0 of 3): on „ჰკითხე თამარ გელაშვილი-ს, …" the
 * server sent the question itself, the model was told to say who it went to,
 * and wrote „თამარ გელაშვილს ვკითხე …" — so the approved sentence naming her
 * assistant never showed.
 */
describe('when the server itself sent the owner’s ask', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('keeps the approved sentence for each person it sent to', () => {
    const sent = chat.slice(chat.indexOf('async function refusedPlanOrSentAsk'));
    expect(sent.slice(0, 2500)).toContain('runServerSentLines.set(runId, {');
    expect(sent.slice(0, 2500)).toContain('personLineForOwner(person, runLang(runId))');
  });

  it('makes that sentence the reply when nobody else was asked in the run', () => {
    expect(chat).toContain(
      'if (serverSentLines !== undefined && askedOne.length === serverSentLines.asked) {',
    );
    expect(chat).toContain('effectiveFinal = serverSentLines.lines;');
  });

  it('is the sentence Giorgi approved, naming the assistant', () => {
    expect(sentSentenceForOwner('თამარ გელაშვილი', 'ka')).toBe(
      'თამარ გელაშვილის ასისტენტს კითხვა გავუგზავნე. როგორც კი პასუხი მოვა, მაშინვე მოგწერ.',
    );
  });

  it('is forgotten when the run ends', () => {
    expect(chat).toContain('runServerSentLines.delete(runId);');
  });

  it('is also the reply when the model sent the instructed ask itself (64450)', () => {
    const at = chat.indexOf('noteAskSentTo(runId, (askOutcome as { to_name?: unknown }).to_name);');
    expect(chat.slice(at, at + 200)).toContain('noteInstructedSendLine(runId,');
    const fn = chat.slice(chat.indexOf('function noteInstructedSendLine'));
    expect(fn.slice(0, 600)).toContain(
      "looksLikeContactInstruction(runOwnerLine.get(runId) ?? '')",
    );
    expect(fn.slice(0, 600)).toContain('sentSentenceForOwner(toName, runLang(runId))');
  });
});
