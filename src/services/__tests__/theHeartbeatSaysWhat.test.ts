import { readFileSync } from 'fs';
import { join } from 'path';
import { heartbeatLine, RUN_STRINGS } from '../runLanguage';

/**
 * Row 304, second half: the 25-second heartbeat said „still working, deep
 * search takes time" and named nothing. It now repeats the last real action.
 */
describe('the heartbeat says what the run is doing', () => {
  it('repeats the last real action, without its emoji', () => {
    expect(heartbeatLine('en', '🔍 Searching your contacts for "lawyer"…')).toBe(
      '⏳ Still on it: Searching your contacts for "lawyer"…',
    );
    expect(heartbeatLine('ka', '📨 გაცნობის მოთხოვნას ვუგზავნი: თორნიკე…')).toBe(
      '⏳ ისევ ამაზე ვმუშაობ: გაცნობის მოთხოვნას ვუგზავნი: თორნიკე…',
    );
  });

  it('keeps the plain line when nothing has been announced yet', () => {
    expect(heartbeatLine('en', null)).toBe(RUN_STRINGS.en.heartbeat);
    expect(heartbeatLine('ka', '  ')).toBe(RUN_STRINGS.ka.heartbeat);
  });

  it('is what the run emits, and is forgotten with the run', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('heartbeatLine(runLang(runId), runLastCaption.get(runId) ?? null)');
    expect(chat).toContain('runLastCaption.set(runId, progressMsg)');
    expect(chat).toContain('runLastCaption.delete(runId)');
  });
});
