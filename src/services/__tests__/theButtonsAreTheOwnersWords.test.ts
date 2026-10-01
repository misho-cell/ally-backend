import { buildReplyLanguageDirective, toolDescription } from '../chat.service';

/**
 * Row 313, the tester's 941 / 957: buttons ordering Netai („გააგრძელე
 * მოძებნა") and step lines starting in English („Both …") kept coming back
 * after every GPT rule — because both are written by the Claude side, which the
 * GPT block never reaches.
 */
describe('the Claude side carries the button and step-line rules', () => {
  it('present_choices says a label is the owner’s own first-person action', () => {
    const description = toolDescription('present_choices');
    expect(description).toContain('EACH LABEL IS WHAT THE OWNER SAYS');
    expect(description).toContain('never „გააგრძელე ძებნა"');
    expect(description).toContain('never „თქვენ"');
  });

  it('the reply language covers the lines between tool calls', () => {
    expect(buildReplyLanguageDirective('ka')).toContain(
      'every short line you write between tool calls',
    );
  });
});
