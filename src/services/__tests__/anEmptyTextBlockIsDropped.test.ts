/**
 * 16 Nov, alerts 496–509 (a real person): every message on two threads ended in
 * „ტექნიკური შეფერხება". The container log for the first one:
 *
 *   400 invalid_request_error: messages: text content blocks must be non-empty
 *
 * The stored tool-results turn carried { type: 'text', text: '' } — the opening
 * search had found nothing, and its empty section was still sent as a block.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import type Anthropic from '@anthropic-ai/sdk';
import { withoutEmptyText } from '../chat.service';

const CALL = 'toolu_test_1';

function storedThread(emptyText: string): Anthropic.MessageParam[] {
  return [
    { role: 'user', content: 'Nino Beridze asked for three workshop venues.' },
    {
      role: 'assistant',
      content: [{ type: 'tool_use', id: CALL, name: 'web_search', input: {} }],
    },
    {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: CALL, content: 'ok' },
        { type: 'text', text: emptyText },
      ],
    },
    { role: 'assistant', content: 'I am looking.' },
  ];
}

describe('a stored turn with an empty text block', () => {
  it('loses only that block', () => {
    const repaired = withoutEmptyText(storedThread(''));
    expect(repaired[2].content).toEqual([
      { type: 'tool_result', tool_use_id: CALL, content: 'ok' },
    ]);
    expect(repaired).toHaveLength(4);
  });

  it('loses a block of only white space too', () => {
    const repaired = withoutEmptyText(storedThread('\n\n '));
    expect(repaired[2].content).toHaveLength(1);
  });

  it('leaves every other row as it was', () => {
    const thread = storedThread('');
    const repaired = withoutEmptyText(thread);
    expect(repaired[0]).toBe(thread[0]);
    expect(repaired[1]).toBe(thread[1]);
    expect(repaired[3]).toBe(thread[3]);
  });

  it('keeps a text block that has text', () => {
    const thread = storedThread('the opening search found two venues');
    expect(withoutEmptyText(thread)[2]).toBe(thread[2]);
  });
});

describe('the history and the run', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('repairs the stored history before the pairs are checked', () => {
    expect(chat).toContain('mergeAdjacentSameRole(repairToolPairs(withoutEmptyText(stored))),');
  });

  it('sends no block for an opening search that found nothing', () => {
    expect(chat).toContain("const lateFindings = (lateSearch?.takeIfReady() ?? '').trim();");
    expect(chat).toContain(
      "...(lateFindings === '' ? [] : [{ type: 'text' as const, text: lateFindings }]),",
    );
  });
});
