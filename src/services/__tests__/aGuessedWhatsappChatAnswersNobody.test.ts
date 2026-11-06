import { readFileSync } from 'fs';
import { join } from 'path';
import { NOT_FROM_A_GUESSED_CHAT_NOTE } from '../chat.service';

/**
 * #8813 (Lika, 4 Nov): her unquoted WhatsApp line went to her goal's chat by a
 * guess, and there „არავის ვიცნობ" was sent to Ninia as a refusal of a request
 * she never saw. A WhatsApp run answers another person's request only from
 * that request's own conversation.
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
const routes = readFileSync(
  join(__dirname, '..', '..', 'api', 'routes', 'threads.routes.ts'),
  'utf8',
);

describe('a WhatsApp line in a guessed conversation', () => {
  it('is marked as from WhatsApp when the app route starts its run', () => {
    expect(routes).toContain('...(askedFrom === WHATSAPP_DEVICE && { fromWhatsapp: true }),');
    expect(chat).toContain('if (intent?.fromWhatsapp === true) runsFromWhatsapp.add(runId);');
  });

  it('does not answer an introduction request from outside that request’s conversation', () => {
    const handler = chat.slice(chat.indexOf("case 'respond_to_introduction'"));
    const guard = handler.indexOf('ownRequest === undefined && runsFromWhatsapp.has(');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(handler.indexOf('const requestId = askedHere ?? asked;'));
  });

  it('does not answer another asker’s question from another conversation unless named', () => {
    const handler = chat.slice(chat.indexOf("case 'send_answer_to_asker'"));
    const guard = handler.indexOf("runsFromWhatsapp.has(runId ?? '')");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(handler.indexOf('await sendApprovedAskAnswer('));
  });

  it('tells the model nothing went and to point the owner at the request', () => {
    expect(NOT_FROM_A_GUESSED_CHAT_NOTE).toMatch(/^Nothing was sent/u);
  });

  it('forgets the mark when the run ends', () => {
    expect(chat).toContain('runsFromWhatsapp.delete(runId);');
  });
});
