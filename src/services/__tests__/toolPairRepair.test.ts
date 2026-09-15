/**
 * Ticket 19 G4 — thread 15148, dead from 13:54:20 onwards.
 *
 * The report asked for the cause to be NAMED FROM THE LOG rather than guessed.
 * The log, deployment d2d404cf, 13:54:30.688890Z:
 *
 *   [POST /threads/:id/message] run failed BadRequestError: 400
 *   messages.16: `tool_use` ids were found without `tool_result` blocks
 *   immediately after: toolu_01WqNSCSfvannXqajBtGLDCG
 *
 * Not two user turns in a row, which was the standing guess. A deploy went out
 * at 13:36:34, the same second run 321e9c8b was replying; the process died
 * between saving the assistant's tool_use and saving the tool_result.
 *
 * An unanswered tool_use was already stripped at the END of the history. Once
 * Ninia wrote again it was no longer at the end, and every later run was
 * rejected before it started — an error in under a second, no run_id.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { repairToolPairs } from '../chat.service';

const ORPHAN = 'toolu_01WqNSCSfvannXqajBtGLDCG';

function user(text: string): Anthropic.MessageParam {
  return { role: 'user', content: text };
}
function assistant(text: string): Anthropic.MessageParam {
  return { role: 'assistant', content: text };
}
function calls(...ids: string[]): Anthropic.MessageParam {
  return {
    role: 'assistant',
    content: ids.map((id) => ({ type: 'tool_use' as const, id, name: 'search_by_tag', input: {} })),
  };
}
function results(...ids: string[]): Anthropic.MessageParam {
  return {
    role: 'user',
    content: ids.map((id) => ({ type: 'tool_result' as const, tool_use_id: id, content: 'ok' })),
  };
}

function idsIn(msg: Anthropic.MessageParam): string[] {
  const content = msg.content;
  if (!Array.isArray(content)) return [];
  return content.flatMap((b) => {
    if (b.type === 'tool_use') return [b.id];
    if (b.type === 'tool_result') return [b.tool_use_id];
    return [];
  });
}

describe('Ticket 19 G4 — the half-finished exchange in the middle', () => {
  it('drops the exact shape that killed 15148: a tool_use the next message never answered', () => {
    const history = [
      user('ნინიას პირველი შეტყობინება'),
      assistant('ვიწყებ'),
      user('Spinom'),
      calls(ORPHAN), // saved; the deploy killed the process before the result
      user('რას შვები?'),
    ];

    const repaired = repairToolPairs(history);

    expect(repaired.flatMap(idsIn)).not.toContain(ORPHAN);
    expect(repaired.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'user']);
  });

  it('is not fixed by position: the orphan is kept out wherever it sits', () => {
    for (const tail of [[], [user('later')], [user('a'), assistant('b'), user('c')]]) {
      const repaired = repairToolPairs([user('first'), calls(ORPHAN), ...tail]);
      expect(repaired.flatMap(idsIn)).not.toContain(ORPHAN);
    }
  });

  it('leaves a complete exchange exactly as it was', () => {
    const history = [user('q'), calls('toolu_A'), results('toolu_A'), assistant('answer')];
    expect(repairToolPairs(history)).toEqual(history);
  });

  it('keeps the answered call and drops only the unanswered one from the same turn', () => {
    const repaired = repairToolPairs([
      user('q'),
      calls('toolu_A', 'toolu_B'),
      results('toolu_A'),
      assistant('answer'),
    ]);
    expect(idsIn(repaired[1])).toEqual(['toolu_A']);
    expect(idsIn(repaired[2])).toEqual(['toolu_A']);
  });

  it('drops a tool_result whose call is not in the message before it', () => {
    const repaired = repairToolPairs([user('q'), results('toolu_GONE'), assistant('answer')]);
    expect(repaired.flatMap(idsIn)).toEqual([]);
    expect(repaired.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('keeps the text that sat beside an unanswered call', () => {
    const [, kept] = repairToolPairs([
      user('q'),
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'ვნახავ' },
          { type: 'tool_use', id: ORPHAN, name: 'search_by_tag', input: {} },
        ],
      },
      user('რას შვები?'),
    ]);
    expect(kept.content).toEqual([{ type: 'text', text: 'ვნახავ' }]);
  });

  it('touches nothing in a history of plain text', () => {
    const history = [user('a'), assistant('b'), user('c')];
    expect(repairToolPairs(history)).toEqual(history);
  });

  it('leaves no unanswered call anywhere, which is the condition the API checks', () => {
    const repaired = repairToolPairs([
      user('q1'),
      calls('toolu_A'),
      results('toolu_A'),
      assistant('a1'),
      user('q2'),
      calls('toolu_ORPHAN_1'),
      user('q3'),
      calls('toolu_B', 'toolu_ORPHAN_2'),
      results('toolu_B'),
      assistant('a2'),
    ]);

    for (let i = 0; i < repaired.length; i++) {
      const content = repaired[i].content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block.type !== 'tool_use') continue;
        const next = repaired[i + 1]?.content;
        const answered =
          Array.isArray(next) &&
          next.some((b) => b.type === 'tool_result' && b.tool_use_id === block.id);
        expect(answered).toBe(true);
      }
    }
  });
});
