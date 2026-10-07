import { readFileSync } from 'fs';
import { join } from 'path';

/** T2543 (case 5, conv 42848): the refused plan's narration came back as „the answer beside the closing tool". */
describe('aRefusedPlanIsNotTheReply', () => {
  it('keeps GPT’s line when the draft is the refused plan’s narration', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const refused = chat.indexOf(
      '} else if (finalIsRewrite && !buriedAnswer && draft !== null && planNarrationRefused) {',
    );
    const stands = chat.indexOf(
      "Claude's answer beside the closing tool stands (${draft.text.length} chars)",
    );
    expect(refused).toBeGreaterThan(0);
    expect(stands).toBeGreaterThan(refused);
    expect(chat).toContain(
      'const planNarrationRefused = bestFromPlanRound && !runPlanForReply.has(runId);',
    );
  });
});
