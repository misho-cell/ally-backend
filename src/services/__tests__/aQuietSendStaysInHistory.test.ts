/**
 * #7229 / #7195 (threads 64087, 63400): a helper's run sent the answer and
 * ended quietly — a tool round with no text after it. The history used to drop
 * that round, so the next run never saw that the answer had gone.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { withoutUnfinishedEnd } from '../chat.service';

const SEND = 'toolu_send';

function user(text: string): Anthropic.MessageParam {
  return { role: 'user', content: text };
}
function assistant(text: string): Anthropic.MessageParam {
  return { role: 'assistant', content: text };
}
function sendCall(): Anthropic.MessageParam {
  return {
    role: 'assistant',
    content: [{ type: 'tool_use', id: SEND, name: 'send_answer_to_asker', input: {} }],
  };
}
function sendResult(): Anthropic.MessageParam {
  return {
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: SEND, content: '{"sent":true}' }],
  };
}

describe('withoutUnfinishedEnd', () => {
  it('keeps a quiet run’s finished send at the end of the history', () => {
    const history = [
      user('ვინ?'),
      assistant('ვის მირჩევ?'),
      user('ზურაბი'),
      sendCall(),
      sendResult(),
    ];
    expect(withoutUnfinishedEnd(history)).toEqual(history);
  });

  it('still ends on the assistant’s text when that is the last line', () => {
    const history = [user('ვინ?'), assistant('ვის მირჩევ?')];
    expect(withoutUnfinishedEnd(history)).toEqual(history);
  });

  it('drops a trailing call that has no result', () => {
    const history = [user('ვინ?'), assistant('ვის მირჩევ?'), user('ზურაბი'), sendCall()];
    expect(withoutUnfinishedEnd(history)).toEqual(history.slice(0, 2));
  });

  it('drops a trailing user line that no answer followed', () => {
    const history = [user('ვინ?'), assistant('ვის მირჩევ?'), user('ზურაბი')];
    expect(withoutUnfinishedEnd(history)).toEqual(history.slice(0, 2));
  });

  it('does not change the rows it was given', () => {
    const history = [user('ვინ?'), assistant('ვის მირჩევ?'), user('ზურაბი')];
    withoutUnfinishedEnd(history);
    expect(history).toHaveLength(3);
  });
});
