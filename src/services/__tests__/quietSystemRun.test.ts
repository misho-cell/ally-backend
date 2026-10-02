/**
 * Board #386: which empty runs end quietly instead of failing.
 */
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
});
