/**
 * The tester's 997 (29833): the model's first answer had no text and no tool
 * call, and the owner was told to try again. A blank first answer is now asked
 * once more by the server; this is the test of what counts as blank.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join } from 'path';
import { isBlankResponse } from '../chat.service';

const message = (content: unknown[], stop_reason = 'end_turn'): Anthropic.Message =>
  ({ content, stop_reason }) as unknown as Anthropic.Message;

describe('isBlankResponse', () => {
  it('is blank with no content at all, or only whitespace', () => {
    expect(isBlankResponse(message([]))).toBe(true);
    expect(isBlankResponse(message([{ type: 'text', text: '  \n ' }]))).toBe(true);
  });

  it('is not blank when there is text', () => {
    expect(isBlankResponse(message([{ type: 'text', text: 'გამარჯობა' }]))).toBe(false);
  });

  it('is not blank when there is a tool to run, even with no text', () => {
    expect(
      isBlankResponse(
        message([{ type: 'tool_use', id: 't', name: 'search_by_tag', input: {} }], 'tool_use'),
      ),
    ).toBe(false);
  });

  /** The tester's 1012 (T166): a tool block the loop would never run is nothing. */
  it('is blank when a tool block will not run (stop_reason is not tool_use)', () => {
    expect(
      isBlankResponse(
        message([{ type: 'tool_use', id: 't', name: 'search_by_tag', input: {} }], 'max_tokens'),
      ),
    ).toBe(true);
  });

  it('is blank when the only text is invisible characters', () => {
    expect(isBlankResponse(message([{ type: 'text', text: '\u200b\ufeff' }]))).toBe(true);
  });

  it('is what the first call is checked with, before anything is surfaced', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

    expect(chat).toContain('if (isBlankResponse(response)) {');
  });
});
