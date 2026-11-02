import type Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join } from 'path';
import { assistantTurnForHistory } from '../unshownNarration';

const TEXT = { type: 'text', text: 'ნინოს შენ შენახული ჰყავხარ როგორც…', citations: null };
const TOOL = { type: 'tool_use', id: 't1', name: 'search_contact_by_name', input: {} };
const TURN = [TEXT, TOOL] as unknown as Anthropic.ContentBlock[];

/**
 * #8548 (the tester's 80752 item 15): „in my previous answer I made a mistake"
 * about narration the owner never saw.
 */
describe('a narration the owner never saw', () => {
  it('leaves the run’s history; its tool calls stay', () => {
    expect(assistantTurnForHistory(TURN, false)).toEqual([TOOL]);
  });

  it('stays when it was shown', () => {
    expect(assistantTurnForHistory(TURN, true)).toEqual(TURN);
  });

  it('stays when there is no tool call to keep the turn valid', () => {
    const textOnly = [TEXT] as unknown as Anthropic.ContentBlock[];
    expect(assistantTurnForHistory(textOnly, false)).toEqual(textOnly);
  });

  it('is applied in both tool loops, to the history and to what is kept', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat.split("pending.push({ role: 'assistant', content: shownTurn });")).toHaveLength(3);
    expect(chat.split("messages.push({ role: 'assistant', content: shownTurn });")).toHaveLength(3);
  });
});
