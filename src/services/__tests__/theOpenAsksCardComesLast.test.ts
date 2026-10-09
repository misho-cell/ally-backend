import { readFileSync } from 'fs';
import { join } from 'path';
import { OpenAsksTap, typedOpenAsksTap } from '../openAsksAfterSolved';

/**
 * 2581 (MTR #7, convs 46443, 46444, 46592): after „მოგვარდა." the close-or-keep
 * card sat above the run's own reply, and a typed „შეაჩერე დანარჩენი." cancelled
 * nothing. The card now comes after the reply; the typed forms count.
 */
describe('the open-questions card after „solved" (2581)', () => {
  it.each([
    'შეაჩერე დანარჩენი.',
    'დახურე დანარჩენი კითხვები',
    'Stop the rest',
    'cancel the others please',
  ])('„%s" closes the rest', (line) => expect(typedOpenAsksTap(line)).toBe(OpenAsksTap.Close));

  it.each(['ღიად დატოვე', 'Keep them open'])('„%s" keeps them', (line) =>
    expect(typedOpenAsksTap(line)).toBe(OpenAsksTap.Keep),
  );

  it.each(['მოგვარდა, მადლობა.', 'stop', 'რა ხდება?'])('„%s" is neither', (line) =>
    expect(typedOpenAsksTap(line)).toBeNull(),
  );

  it('finish_task notes the card, and it is written after the reply is stored', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('await noteOpenAsksCard(runId, taskId, threadId, Number(userId))');
    const delivered = chat.indexOf(
      'await deliverPendingMessages(userId, threadId, runId, language, toDeliver);',
    );
    expect(chat.indexOf('await offerNotedOpenAsksCard(runId);', delivered)).toBeGreaterThan(
      delivered,
    );
  });

  it('a typed answer is read only while a card waits (the same claim as the tap)', () => {
    const src = readFileSync(join(__dirname, '..', 'openAsksAfterSolved.ts'), 'utf8');
    expect(src).toContain('const tap = openAsksTapOf(message) ?? typedOpenAsksTap(message);');
  });
});
