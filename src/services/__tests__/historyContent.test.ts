/**
 * Ticket 19 item 1 — the thread that died after „მოგვიანებით".
 *
 * The cause was not the tap. It was being SHOWN the card.
 *
 * A `pending` row's content_json is an object — { text, instruction, choices }
 * — and the history builder handed it to the API with a cast that told
 * TypeScript the shape was right and asked the database nothing. Anthropic
 * rejected every such request with „messages.N.content: Input should be a
 * valid array", so once a goal-waiting card existed in a thread, not one later
 * message could be answered. Found in the deployment log for thread 14985 at
 * 09:43:19 on 15 September, three 400s in two seconds.
 */
import { toMessageContent } from '../chat.service';

type Row = Parameters<typeof toMessageContent>[0];

function row(over: Partial<Row>): Row {
  return { role: 'assistant', content: '', content_json: null, ...over } as Row;
}

describe('what a stored row becomes in the model history', () => {
  it('turns a pending card into the words the user actually saw', () => {
    const content = toMessageContent(
      row({
        content_json: {
          text: 'მიზანი „მჭირდება კარგი ვეტერინარი თბილისში" შენს პასუხს ელოდება.',
          instruction: 'უპასუხე ან გადადე.',
          choices: ['ახლა', 'მოგვიანებით'],
        },
      }),
    );

    // A string or an array — never the raw object, which is what the API
    // refused.
    expect(typeof content).toBe('string');
    expect(content).toContain('ვეტერინარი');
    expect(content).toContain('უპასუხე ან გადადე.');
  });

  it('passes a real content-block array through untouched', () => {
    const blocks = [{ type: 'text', text: 'hello' }];
    expect(toMessageContent(row({ content_json: blocks }))).toBe(blocks);
  });

  it('passes a plain string through', () => {
    expect(toMessageContent(row({ content_json: 'just text' }))).toBe('just text');
  });

  it('falls back to the plain column when the json says nothing usable', () => {
    // Better an empty message the strippers drop than one the API refuses:
    // the first costs a turn, the second costs the whole thread.
    expect(toMessageContent(row({ content: 'from the column', content_json: {} }))).toBe(
      'from the column',
    );
    expect(toMessageContent(row({ content: 'from the column', content_json: 42 }))).toBe(
      'from the column',
    );
  });
});
