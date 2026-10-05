/**
 * Board #386: which empty runs end quietly instead of failing.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { didWorkWorthALine, endsQuietly } from '../quietSystemRun';
import { RUN_STRINGS } from '../runLanguage';

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

/** #1057, night question L (Misho, 5 Oct): a system run that searched says one line. */
describe('a system run that searched and wrote nothing', () => {
  const searched = [
    { role: 'assistant' as const, content: [{ type: 'tool_use', name: 'web_search' }] },
  ];
  const keptBooks = [
    { role: 'assistant' as const, content: [{ type: 'tool_use', name: 'set_task_wake' }] },
  ];

  it('is worth a line; one that only kept the books is not', () => {
    expect(didWorkWorthALine(searched)).toBe(true);
    expect(didWorkWorthALine(keptBooks)).toBe(false);
    expect(
      didWorkWorthALine([
        { role: 'assistant', content: [{ type: 'tool_use', name: 'propose_task_plan' }] },
      ]),
    ).toBe(true);
  });

  it('says it in the conversation’s language, before the quiet ending is considered', () => {
    expect(RUN_STRINGS.ka.lookedAgainNothingNew).toContain('ისევ ვეძებე');
    expect(RUN_STRINGS.en.lookedAgainNothingNew).toContain('looked again');
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const line = chat.indexOf('didWorkWorthALine(pending) &&');
    expect(line).toBeGreaterThan(0);
    expect(line).toBeLessThan(chat.indexOf('endsQuietly(ownerAbsent, pending'));
  });
});
