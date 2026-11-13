jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: jest.fn() } },
}));
jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordClaudeUsage: jest.fn().mockResolvedValue(undefined),
}));

import { readFileSync } from 'fs';
import { join } from 'path';

import anthropic from '../../config/anthropic';
import { intentFromAnswer, readSearchIntent, SearchIntent } from '../searchIntent.service';

const mockCreate = anthropic.messages.create as unknown as jest.Mock;
const ORIGIN = { userId: '186272', runId: 'run-1', threadId: 501 };

function replies(text: string): void {
  mockCreate.mockResolvedValue({ content: [{ type: 'text', text }], usage: {} });
}

/**
 * Misho, 13 Nov: „search the web for an organisation automatically, and use the
 * web in most requests — unless they ask specifically to look in their
 * contacts." Giorgi's „სამხარაულში მყავს ვინმე?" searched only his network.
 */
describe('what kind of message the owner wrote', () => {
  beforeEach(() => mockCreate.mockReset());

  it('is read from the small model’s one word', () => {
    expect(intentFromAnswer(' Web.')).toBe(SearchIntent.Web);
    expect(intentFromAnswer('contacts')).toBe(SearchIntent.ContactsOnly);
    expect(intentFromAnswer('none')).toBe(SearchIntent.None);
    expect(intentFromAnswer('maybe')).toBe(SearchIntent.None);
  });

  it('asks the model about the owner’s own line', async () => {
    replies('web');
    expect(await readSearchIntent('სამხარაულში მყავს ვინმე?', ORIGIN)).toBe(SearchIntent.Web);
    const [request] = mockCreate.mock.calls[0];
    expect(request.messages[0].content).toBe('სამხარაულში მყავს ვინმე?');
    expect(request.system).toContain('do I have anyone at the forensic bureau?');
  });

  it('sends nothing to the web on a failure, an empty line or anything unclear', async () => {
    mockCreate.mockRejectedValueOnce(new Error('overloaded'));
    expect(await readSearchIntent('who builds houses in Batumi?', ORIGIN)).toBe(SearchIntent.None);
    expect(await readSearchIntent('   ', ORIGIN)).toBe(SearchIntent.None);
  });

  it('reads „who has X saved" as a contacts look-up (live, 13 Nov: „დირექტორი ვის უწერია?" went to the web)', () => {
    const prompt = readFileSync(join(__dirname, '..', 'searchIntent.service.ts'), 'utf8');
    expect(prompt).toContain('asks whose contacts carry that label, so it is contacts');
  });

  it('keeps a named person’s look-up to the contacts (row 253: a name never leaves for nothing)', () => {
    const prompt = readFileSync(join(__dirname, '..', 'searchIntent.service.ts'), 'utf8');
    expect(prompt).toContain(
      "or to find, ' +\n  'reach or be introduced to one particular person they name.",
    );
  });
});

describe('the web in the chat', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const opening = readFileSync(join(__dirname, '..', 'openingSearch.service.ts'), 'utf8');

  it('is searched for a request that opens no goal, when the owner is there and wrote something', () => {
    expect(chat).toContain(': startOpeningSearches(userId, userMessage, runId, threadId);');
    expect(chat).toContain(": ownerAbsent || userMessage.trim() === ''");
  });

  it('only when the message asks for it', () => {
    expect(chat).toContain('return intent === SearchIntent.Web;');
    expect(chat).toContain(': webIsWanted(userId, goalText, runId, threadId);');
  });

  it('runs the web’s half only, with no second-circle search beside the model’s', () => {
    expect(chat).toContain(
      'go ? runOpeningSearches(userId, goalText, runId, threadId, taskId !== null) : null',
    );
    expect(opening).toContain(': Promise.resolve(null),');
    expect(opening).toContain(
      "if (secondDegree === null && withSecondCircle) missing.push('search_second_degree');",
    );
  });

  it('keeps the goal’s own rules to goals: the quick-answer line and the search-first nudge', () => {
    expect(chat).toContain("(autoGoalId === null ? '' : QUICK_ANSWER_NOTE)");
    expect(chat).toContain('lateSearch?.forGoal === true');
  });
});
