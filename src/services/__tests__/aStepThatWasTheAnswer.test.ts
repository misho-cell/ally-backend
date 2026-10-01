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
