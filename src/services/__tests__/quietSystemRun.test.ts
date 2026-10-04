/**
 * Board #386: which empty runs end quietly instead of failing.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { endsQuietly } from '../quietSystemRun';

const RESCHEDULED = [
  { role: 'assistant' as const, content: [{ type: 'tool_use' }] },
  { role: 'user' as const, content: [{ type: 'tool_result' }] },
];
const DID_NOTHING = [{ role: 'assistant' as const, content: [{ type: 'text' }] }];

describe('endsQuietly', () => {
  it('lets a system run that called a tool end without a word', () => {
    expect(endsQuietly(true, RESCHEDULED)).toBe(true);
  });

  it('still fails a system run that called no tool', () => {
    expect(endsQuietly(true, DID_NOTHING)).toBe(false);
    expect(endsQuietly(true, [])).toBe(false);
  });

  it('still fails a run the owner started, tools or not', () => {
    expect(endsQuietly(false, RESCHEDULED)).toBe(false);
  });

  it('does not count a tool result as a call', () => {
    expect(endsQuietly(true, [{ role: 'user', content: [{ type: 'tool_use' }] }])).toBe(false);
  });

  it('lets a system run that answered only in a stage direction end quietly (26302)', () => {
    expect(endsQuietly(true, DID_NOTHING, true)).toBe(true);
  });

  it('still fails an owner’s run that answered only in a stage direction', () => {
    expect(endsQuietly(false, DID_NOTHING, true)).toBe(false);
  });

  it('is told about the dropped stage direction where the final is decided', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('const answeredOnlyInStageDirection = STAGE_DIRECTION_ONLY_RE.test(');
    expect(chat).toContain('endsQuietly(ownerAbsent, pending, answeredOnlyInStageDirection)');
  });

  /** 4 Oct 02:32Z, thread 31510: a blank night re-check told the owner to try again. */
  it('never stores the retry line in the owner’s conversation for a system run', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      "if (!ownerAbsent) await saveMessage(userId, threadId, 'assistant', failureReply, 'error');",
    );
  });
});
