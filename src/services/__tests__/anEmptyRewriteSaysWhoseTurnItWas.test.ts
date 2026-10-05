import { lastToolName, lastTurnShape } from '../finalAnswer.service';

/** 5 Oct: one GPT reply in five came back empty; the log names the last turn's shape. */
describe('the empty rewrite names the last turn it was handed', () => {
  it('gives role, size and turn count, never the text', () => {
    const shape = lastTurnShape([
      { role: 'system', content: 'rules' },
      { role: 'user', content: 'secret words' },
      { role: 'assistant', content: 'abc' },
    ]);
    expect(shape).toBe('assistant, 3 chars of 3 turns');
    expect(shape).not.toContain('abc');
  });

  it('says none for an empty list', () => {
    expect(lastTurnShape([])).toBe('none, 0 chars of 0 turns');
  });
});

describe('the empty rewrite names the last tool the run called', () => {
  it('gives the name only', () => {
    expect(
      lastToolName([
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'a', name: 'search_by_tag', input: { tag_query: 'x' } },
            { type: 'tool_use', id: 'b', name: 'present_choices', input: {} },
          ],
        },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'b', content: 'ok' }] },
      ]),
    ).toBe('present_choices');
  });

  it('says none when no tool ran', () => {
    expect(lastToolName([{ role: 'user', content: 'hi' }])).toBe('none');
  });
});
