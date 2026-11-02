import { ALWAYS_ON_TOOLS, buildReplyLanguageDirective } from '../chat.service';

/**
 * Row 313, the tester's 941 / 957: buttons ordering Netai („გააგრძელე
 * მოძებნა") and step lines starting in English („Both …") kept coming back
 * after every GPT rule — because both are written by the Claude side, which the
 * GPT block never reaches.
 */
describe('the Claude side carries the button and step-line rules', () => {
  // #8526 (the tester's 80752 item 12, cases 119 and 52): no button leaves the
  // server since #8054, so a tool that draws them must not be offered at all.
  it('does not offer present_choices', () => {
    expect(ALWAYS_ON_TOOLS.some((tool) => tool.name === 'present_choices')).toBe(false);
  });

  it('the reply language covers the lines between tool calls', () => {
    expect(buildReplyLanguageDirective('ka')).toContain(
      'every short line you write between tool calls',
    );
  });
});
