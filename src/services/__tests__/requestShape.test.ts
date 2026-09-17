import Anthropic from '@anthropic-ai/sdk';
import { countToolResults, toolResultsInLastTurn } from '../requestShape';

function toolResult(id: string): Anthropic.ContentBlockParam {
  return { type: 'tool_result', tool_use_id: id, content: 'ok' };
}

describe('requestShape', () => {
  it('counts nothing in an empty conversation', () => {
    expect(countToolResults([])).toBe(0);
    expect(toolResultsInLastTurn([])).toBe(0);
  });

  it('ignores plain string turns, which carry no blocks at all', () => {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: 'ვეტერინარი მჭირდება' },
      { role: 'assistant', content: 'ვეძებ' },
    ];
    expect(countToolResults(messages)).toBe(0);
    expect(toolResultsInLastTurn(messages)).toBe(0);
  });

  it('separates the last turn from the whole conversation', () => {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: 'პირველი' },
      { role: 'assistant', content: [{ type: 'text', text: 'ვეძებ' }] },
      { role: 'user', content: [toolResult('a'), toolResult('b')] },
      { role: 'assistant', content: [{ type: 'text', text: 'კიდევ' }] },
      { role: 'user', content: [toolResult('c'), toolResult('d'), toolResult('e')] },
    ];
    // Three in the last turn, five in the request as a whole — the two numbers
    // the seat's question needs kept apart.
    expect(toolResultsInLastTurn(messages)).toBe(3);
    expect(countToolResults(messages)).toBe(5);
  });

  it('does not count text blocks that sit beside a tool result', () => {
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: [toolResult('a'), { type: 'text', text: 'და ეს' }],
      },
    ];
    expect(toolResultsInLastTurn(messages)).toBe(1);
    expect(countToolResults(messages)).toBe(1);
  });
});
