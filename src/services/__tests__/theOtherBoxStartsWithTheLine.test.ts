import { readFileSync } from 'fs';
import { join } from 'path';
import { withOtherPrefill } from '../otherPrefill';

/** 1688 part 2: „other" opens with the prepared line for the reader to edit, not an empty box. */
const LINE = 'კი, ვაკეთებ საბაჟო გაფორმებას საკვების ექსპორტიორებისთვის.';

describe('the „other" box starts with the prepared line', () => {
  it('goes on the newest assistant message with an „other" button only', () => {
    const messages = [
      { id: 1, role: 'assistant', other_choice_index: 2 },
      { id: 2, role: 'user' },
      { id: 3, role: 'assistant', other_choice_index: 3 },
      { id: 4, role: 'assistant' },
    ];
    const out = withOtherPrefill(messages, LINE);
    expect(out[2]).toEqual({
      id: 3,
      role: 'assistant',
      other_choice_index: 3,
      other_prefill: LINE,
    });
    expect(out.filter((m) => 'other_prefill' in m)).toHaveLength(1);
  });

  it('adds nothing without a line, or without an „other" button', () => {
    const messages = [{ id: 1, role: 'assistant', other_choice_index: 1 }];
    expect(withOtherPrefill(messages, null)).toEqual(messages);
    expect(withOtherPrefill(messages, '  ')).toEqual(messages);
    expect(withOtherPrefill([{ id: 1, role: 'assistant' }], LINE)).toEqual([
      { id: 1, role: 'assistant' },
    ]);
  });

  it('is served on the messages route, best-effort', () => {
    const route = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'threads.routes.ts'),
      'utf8',
    );
    expect(route).toContain('const prefill = await preparedAnswerOn(threadId).catch(() => null);');
    expect(route).toContain('data: withOtherPrefill(messages.map(withChoiceNotes), prefill),');
  });
});
