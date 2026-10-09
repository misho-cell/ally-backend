import { readFileSync } from 'fs';
import { join } from 'path';
import { smallTalkReasoningEffort } from '../finalAnswer.service';

/** 958 (§110): the small-talk writer's reasoning effort comes from an env var; unset changes nothing. */
describe('the small-talk reasoning effort', () => {
  it('takes only the four known values', () => {
    expect(smallTalkReasoningEffort('low')).toBe('low');
    expect(smallTalkReasoningEffort(' Minimal ')).toBe('minimal');
    expect(smallTalkReasoningEffort('fast')).toBeNull();
    expect(smallTalkReasoningEffort(undefined)).toBeNull();
  });

  it('is sent only for the small-talk model, never the ordinary writer', () => {
    const src = readFileSync(join(__dirname, '..', 'finalAnswer.service.ts'), 'utf8');
    expect(src).toContain(
      "SMALL_TALK_FINAL_MODEL !== '' && model === SMALL_TALK_FINAL_MODEL && effort !== null",
    );
    expect(src).toContain('...effortFor(model),');
  });
});
