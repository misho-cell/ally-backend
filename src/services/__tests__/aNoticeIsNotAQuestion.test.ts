import { readFileSync } from 'fs';
import { join } from 'path';
import { ASK_KIND_FIELD, AskKind, askKindFrom } from '../askKind';
import { askChoicesFor } from '../askOpening';

/**
 * Tornike's 8 Nov report, #9: Lika told her assistant to let Tornike know she
 * could not go on with a request. It went to him as an ask, and two days later
 * he was reminded that „Lika is still waiting for your answer". The asking
 * model now says when a message asks nothing (kind: notice): no buttons, and
 * no reminder.
 */
const ASKS = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');

describe('a notice', () => {
  it('is a kind the asking model can give', () => {
    expect(askKindFrom('notice')).toBe(AskKind.Notice);
    expect(ASK_KIND_FIELD.enum).toContain('notice');
    expect(ASK_KIND_FIELD.description).toContain('notice (asks nothing');
  });

  it('carries no reply buttons and no people picker', () => {
    expect(askChoicesFor(AskKind.Notice, 'ka')).toEqual([]);
    expect(askChoicesFor(AskKind.Notice, 'en')).toEqual([]);
    expect(ASKS).toContain(
      'const pickerAllowed = !sameThread && askKind !== AskKind.Intro && !isNotice;',
    );
    expect(ASKS).toContain('const ownButtons = openQuestion || isNotice ? undefined : authored;');
  });

  it('is never reminded', () => {
    const sweep = ASKS.slice(ASKS.indexOf('UPDATE task_asks SET reminded_at = NOW()'));
    expect(sweep.slice(0, 600)).toContain("AND ask_kind IS DISTINCT FROM 'notice'");
  });

  it('leaves every other kind as it was', () => {
    expect(askChoicesFor(AskKind.Open, 'ka')).toHaveLength(1);
    expect(askKindFrom(undefined)).toBe(AskKind.Open);
  });
});
