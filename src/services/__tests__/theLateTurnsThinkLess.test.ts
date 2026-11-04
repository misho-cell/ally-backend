import { readFileSync } from 'fs';
import { join } from 'path';
import {
  pastTheSearchPhase,
  refusedTheThinkingSetting,
  SEARCH_PHASE_CAP_MS,
} from '../chat.service';

/**
 * #8681 FAIL 3 (the tester's 82593): the turn that wrote the answer after the
 * searches thought for 38 s before its first word. Past the search phase the
 * main model answers without extended thinking.
 */
describe('a turn past the search phase', () => {
  it('starts once the search phase is over', () => {
    expect(pastTheSearchPhase(SEARCH_PHASE_CAP_MS - 1)).toBe(false);
    expect(pastTheSearchPhase(SEARCH_PHASE_CAP_MS + 1)).toBe(true);
  });

  it('knows the API refusing the setting from any other failure', () => {
    expect(
      refusedTheThinkingSetting('thinking.type: disabled is not supported for this model'),
    ).toBe(true);
    expect(refusedTheThinkingSetting('invalid_request_error: thinking type invalid')).toBe(true);
    expect(refusedTheThinkingSetting('overloaded_error')).toBe(false);
    expect(refusedTheThinkingSetting('stream stalled after 45000ms')).toBe(false);
  });

  it('is what the tool loop calls, and only the main model drops its thinking', () => {
    const source = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(source).toContain('response = await callClaudeLate(');
    expect(source).toContain('opts.quickThought === true && model === MODEL');
  });
});
