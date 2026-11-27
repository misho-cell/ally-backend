/**
 * Misho, 26 Nov (point 7): after the information, the next step — what Netai
 * does and what the owner has to do — stands at the end, in bold.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  MARKDOWN_BOLD,
  markdownBoldToWhatsapp,
  withBoldNames,
  withNextStepBold,
} from '../whatsappBold';

const ANSWER = 'Nino Beridze teaches snowboarding in Bakuriani; you saved her as „trainer".';
const STEP = 'Next: I write to Nino Beridze today; you only tap Yes.';

describe('the next step is bold at the end', () => {
  it('bolds the last short paragraph, line by line', () => {
    expect(withNextStepBold(`${ANSWER}\n\n${STEP}`)).toBe(`${ANSWER}\n\n*${STEP}*`);
    expect(withNextStepBold(`${ANSWER}\n\nNext: I write.\nYou: tap Yes.`)).toBe(
      `${ANSWER}\n\n*Next: I write.*\n*You: tap Yes.*`,
    );
  });

  it('leaves a one-paragraph reply, a long last paragraph and a list as they are', () => {
    expect(withNextStepBold(ANSWER)).toBe(ANSWER);
    const long = `${ANSWER}\n\n${'word '.repeat(80).trim()}`;
    expect(withNextStepBold(long)).toBe(long);
    const list = `${ANSWER}\n\n• Nino Beridze\n• Levan Japaridze`;
    expect(withNextStepBold(list)).toBe(list);
    const numbered = `${ANSWER}\n\n1. Nino Beridze\n2. Levan Japaridze`;
    expect(withNextStepBold(numbered)).toBe(numbered);
  });

  it('does not bold a name again inside the bold step, and still bolds it above', () => {
    const text = withBoldNames(withNextStepBold(`${ANSWER}\n\n${STEP}`), ['Nino Beridze']);
    expect(text).toBe(
      `*Nino Beridze* teaches snowboarding in Bakuriani; you saved her as „trainer".\n\n*${STEP}*`,
    );
  });

  it('is in both WhatsApp copies: the reply and the goal’s news', () => {
    const replies = readFileSync(join(__dirname, '..', 'whatsappReplies.service.ts'), 'utf8');
    expect(replies).toContain(
      'withNextStepBold(markdownBoldToWhatsapp(reply.trim())),\n            takeNewsCards(userId, threadId),',
    );
    expect(replies).toContain(
      'replyText(withNextStepBold(markdownBoldToWhatsapp(reply)), choices, buttons !== null)',
    );
  });

  it('is bold in the app too, in Markdown, and reads as WhatsApp bold there (Lika, 27 Nov)', () => {
    const app = withNextStepBold(`${ANSWER}\n\n${STEP}`, MARKDOWN_BOLD);
    expect(app).toBe(`${ANSWER}\n\n**${STEP}**`);
    expect(withNextStepBold(markdownBoldToWhatsapp(app))).toBe(`${ANSWER}\n\n*${STEP}*`);
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('withNextStepBold(scrubMechanicalForStorage(reply), MARKDOWN_BOLD),');
  });
});
