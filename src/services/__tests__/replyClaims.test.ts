const create = jest.fn();
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: (...args: unknown[]) => create(...args) } },
}));
jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordClaudeUsage: jest.fn().mockResolvedValue(undefined),
}));

import {
  ClaimKind,
  claimsFromAnswer,
  claimsOfKind,
  makesClaim,
  NO_CLAIMS,
  OwnerAsk,
  readReplyClaims,
  withoutSentences,
} from '../replyClaims.service';

const REPLY = 'ბახვა „საცდელ ლოჯისტიკაში" მუშაობს. შევინახე: ბახვა, სამუშაო ადგილი.';
const SAVED = 'შევინახე: ბახვა, სამუშაო ადგილი.';
const ORIGIN = { userId: '1', runId: 'r', threadId: 2 };

/** #8779 c (Misho, 5 Nov: „პატარა მოდელი"): the claims are the small model's reading. */
describe('the model’s answer, checked against the reply', () => {
  it('keeps the kinds and sentences that stand in the reply', () => {
    const answer = JSON.stringify({ owner: ['only_asks_a_question'], claims: { saved: [SAVED] } });
    const claims = claimsFromAnswer(answer, REPLY);
    expect(claimsOfKind(claims, ClaimKind.Saved)).toEqual([SAVED]);
    expect(claims.ownerAsks.has(OwnerAsk.OnlyAsks)).toBe(true);
  });

  it('drops a sentence that is not in the reply word for word — it cannot invent one', () => {
    const answer = JSON.stringify({ claims: { deleted: ['წავშალე.'] } });
    expect(makesClaim(claimsFromAnswer(answer, REPLY), ClaimKind.Deleted)).toBe(false);
  });

  it('drops unknown kinds and owner readings', () => {
    const answer = JSON.stringify({ owner: ['wants_cake'], claims: { cake: [SAVED] } });
    const claims = claimsFromAnswer(answer, REPLY);
    expect(claims.ownerAsks.size).toBe(0);
    expect(Object.keys(claims.sentences)).toEqual([]);
  });

  it('reads JSON wrapped in words, and nothing from no JSON', () => {
    const wrapped = `Here: ${JSON.stringify({ claims: { saved: [SAVED] } })}`;
    expect(makesClaim(claimsFromAnswer(wrapped, REPLY), ClaimKind.Saved)).toBe(true);
    expect(claimsFromAnswer('none', REPLY)).toBe(NO_CLAIMS);
  });
});

describe('taking sentences out', () => {
  it('keeps the rest of the reply', () => {
    expect(withoutSentences(REPLY, [SAVED])).toBe('ბახვა „საცდელ ლოჯისტიკაში" მუშაობს.');
  });

  it('leaves the reply whole when nothing would be left', () => {
    expect(withoutSentences(SAVED, [SAVED])).toBe(SAVED);
  });
});

describe('reading the claims', () => {
  beforeEach(() => create.mockReset());

  it('asks the small model with the owner line and the reply', async () => {
    create.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ claims: { saved: [SAVED] } }) }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const claims = await readReplyClaims(REPLY, 'სად მუშაობს ბახვა?', ORIGIN);
    expect(makesClaim(claims, ClaimKind.Saved)).toBe(true);
    const [request] = create.mock.calls[0] as [{ messages: { content: string }[] }];
    expect(request.messages[0]?.content).toContain('OWNER:\nსად მუშაობს ბახვა?');
    expect(request.messages[0]?.content).toContain(`REPLY:\n${REPLY}`);
  });

  it('claims nothing on an empty reply, without a call', async () => {
    expect(await readReplyClaims('  ', 'x', ORIGIN)).toBe(NO_CLAIMS);
    expect(create).not.toHaveBeenCalled();
  });

  it('claims nothing when the model fails', async () => {
    create.mockRejectedValue(new Error('timeout'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await readReplyClaims(REPLY, 'x', ORIGIN)).toBe(NO_CLAIMS);
  });
});
