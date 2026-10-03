import { readFileSync } from 'fs';
import { join } from 'path';
import {
  asksForAction,
  asksToDiscussFirst,
  DISCUSS_TURN_NOTE,
  discussionHolds,
  lineDecidesDiscussion,
} from '../discussFirst';

/**
 * Board #67 (a loyal old Ally customer, 1 Oct): „ask me first, I don't need
 * leads now" was answered with lead-finding, twice. The owner's word now holds
 * until they ask for action.
 */
describe('asking to discuss first', () => {
  it.each([
    'ჯერ მკითხე ჩემს ბიზნესზე, ლიდები ახლა არ მინდა',
    'კითხვები დამისვი',
    'მოდი განვიხილოთ',
    'ნუ მოძებნი არავის, ჯერ ვისაუბროთ',
    "Ask me about my business first, don't look for leads",
    "Let's discuss",
    "I don't need leads now, ask me first",
    'Давай обсудим',
  ])('„%s" asks to discuss', (line) => {
    expect(lineDecidesDiscussion(line)).toBe(true);
  });

  it.each([
    'ახლა მოძებნე',
    'დაიწყე',
    'შეადგინე გეგმა',
    'Go ahead',
    "OK, let's start",
    'Find me three distributors',
    'Now find them',
    'Make a plan',
  ])('„%s" asks for action', (line) => {
    expect(lineDecidesDiscussion(line)).toBe(false);
  });

  it.each([
    'ლიდები არ მაქვს',
    'I have no leads at all',
    'My clients find me through Instagram',
    'კოსმეტიკას ვყიდი სალონებზე',
  ])('„%s" decides nothing', (line) => {
    expect(asksToDiscussFirst(line)).toBe(false);
    expect(asksForAction(line)).toBe(false);
  });

  it('lets the discuss request win over a negated action word in one line', () => {
    expect(lineDecidesDiscussion('ნუ მოძებნე, ჯერ მკითხე')).toBe(true);
    expect(lineDecidesDiscussion("Don't start searching, let's talk")).toBe(true);
  });
});

describe('the discussion lasts until the owner asks for action', () => {
  const askFirst = "Ask me about my business first, don't look for leads";

  it('holds while the owner answers questions', () => {
    expect(discussionHolds(['I sell cosmetics to salons in Tbilisi', askFirst])).toBe(true);
  });

  it('ends when the owner asks for action', () => {
    expect(discussionHolds(['Go ahead, find distributors', 'We have 12 salons', askFirst])).toBe(
      false,
    );
  });

  it('starts again when the owner asks again', () => {
    expect(discussionHolds([askFirst, 'Go ahead'])).toBe(true);
  });

  it('is off in a conversation that never asked', () => {
    expect(discussionHolds(['I need an accountant in Tbilisi'])).toBe(false);
    expect(discussionHolds([])).toBe(false);
  });
});

describe('what a discussion turn is', () => {
  it('has no tools and asks questions, never leads or a plan', () => {
    expect(DISCUSS_TURN_NOTE).toContain('This turn has no tools');
    expect(DISCUSS_TURN_NOTE).toContain('no search, no plan, no leads');
    expect(DISCUSS_TURN_NOTE).toContain('Do not tell them what their business is');
    expect(DISCUSS_TURN_NOTE).toContain('ask one or two short questions');
  });

  it('is wired into the run and the goal opener', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('discussionHolds(ownerLinesNewestFirst(messages))');
    expect(chat).toContain('...(discussing && { forceText: true, maxTokens: DISCUSS_MAX_TOKENS })');
    expect(chat).toContain('if (await conversationIsDiscussion(threadId, userMessage)) {');
  });
});
