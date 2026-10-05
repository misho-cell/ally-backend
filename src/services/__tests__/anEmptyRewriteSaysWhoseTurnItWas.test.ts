import { lastToolName, lastTurnShape, withoutTrailingHousekeeping } from '../finalAnswer.service';

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

describe('a trailing round that only kept the books', () => {
  const search = [
    { role: 'user', content: 'find a plumber' },
    {
      role: 'assistant',
      content: [{ type: 'tool_use', id: 's', name: 'search_by_tag', input: { tag_query: 'x' } }],
    },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 's', content: 'Gia, plumber' }] },
  ] as const;
  const books = [
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'I found Gia.' },
        { type: 'tool_use', id: 'w', name: 'set_task_wake', input: { hours: 24 } },
      ],
    },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'w', content: 'ok' }] },
  ] as const;

  it('is taken off what GPT reads, so it writes from the findings (15 of 19 empty answers)', () => {
    const out = withoutTrailingHousekeeping([...search, ...books] as never);
    expect(out).toHaveLength(3);
    expect(JSON.stringify(out[2])).toContain('Gia, plumber');
  });

  it('is taken off a scheduled check too, so GPT answers the event (54 of 173 after the first fix)', () => {
    const only = [
      { role: 'user', content: '[მოვლენა] დაგეგმილი შემოწმების დროა' },
      ...books,
    ] as never;
    expect(withoutTrailingHousekeeping(only)).toHaveLength(1);
  });

  it('never leaves GPT an empty history', () => {
    expect(withoutTrailingHousekeeping([...books] as never)).toHaveLength(2);
  });

  it('leaves a run that ended on a real tool alone', () => {
    expect(withoutTrailingHousekeeping([...search] as never)).toHaveLength(3);
  });
});
