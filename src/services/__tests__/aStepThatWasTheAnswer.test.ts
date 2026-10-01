import { readFileSync } from 'fs';
import { join } from 'path';
import { namedStepCaption } from '../runLanguage';

/**
 * Tester 928. Row 312's server half: a narration step promoted to the final
 * reply stayed on screen as a step too. Row 304: the saved-info search line
 * named nothing.
 */
describe('a step that turned out to be the answer is withdrawn', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('withdraws the live step wherever a narration is promoted', () => {
    const promotions =
      chat.split('if (bestStepId !== null) await deleteMessage(bestStepId);').length - 1;
    const retractions =
      chat.split('emitStepRetracted(userId, threadId, runId, bestNarration);').length - 1;
    expect(promotions).toBe(2);
    expect(retractions).toBe(2);
  });

  it('sends it as its own event', () => {
    const sse = readFileSync(join(__dirname, '..', 'sse.service.ts'), 'utf8');
    expect(sse).toContain("event: 'step_retracted'");
  });
});

describe('the saved-info search says what it searches for', () => {
  it('names the search words in every language', () => {
    expect(namedStepCaption('search_by_insight', { search_query: 'ადვოკატი' }, 'ka')).toBe(
      '🔍 შენახულ ინფოში ვეძებ: „ადვოკატი"…',
    );
    expect(namedStepCaption('search_by_insight', { search_query: 'lawyer' }, 'en')).toBe(
      '🔍 Searching saved info for "lawyer"…',
    );
    expect(namedStepCaption('search_by_insight', { search_query: 'юрист' }, 'ru')).toContain(
      'юрист',
    );
    expect(namedStepCaption('search_by_insight', { search_query: 'abogado' }, 'es')).toContain(
      'abogado',
    );
  });
});

/** Plate 304, the tester's 941: the line while a question goes out names the person. */
describe('the sending line names who is written to', () => {
  it('names the recipient in every language', () => {
    expect(namedStepCaption('ask_contact', { contact_name: 'Netai Test 88' }, 'ka')).toBe(
      '✉️ Netai Test 88-ს ვწერ…',
    );
    expect(namedStepCaption('ask_contact', { contact_name: 'Netai Test 88' }, 'en')).toBe(
      '✉️ Writing to Netai Test 88…',
    );
    expect(namedStepCaption('ask_contact', { contact_name: 'Нино' }, 'ru')).toContain('Нино');
    expect(namedStepCaption('ask_contact', { contact_name: 'Nino' }, 'es')).toContain('Nino');
  });

  it('falls back to the plain line when no name was passed', () => {
    expect(namedStepCaption('ask_contact', { phone: 'x' }, 'ka')).toBeNull();
  });

  it('is offered the name field by the tool', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const tool = chat.slice(chat.indexOf("name: 'ask_contact'"));
    expect(tool.slice(0, tool.indexOf("required: ['task_id', 'phone', 'question']"))).toContain(
      'contact_name: {',
    );
  });
});
