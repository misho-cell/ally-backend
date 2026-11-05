const create = jest.fn();
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: (...args: unknown[]) => create(...args) } },
}));
jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordClaudeUsage: jest.fn().mockResolvedValue(undefined),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  FactChange,
  factChangedIn,
  factChangedRefusal,
  factChangeFromAnswer,
} from '../factKeeping';

/**
 * Board #100 (plate F1): an ask said „for a friend" though the owner asked for
 * himself, and „last year" became „this year". #8779 (ops 18:45Z): a small model
 * reads it now; the word lists that refused „იგივე" are gone.
 */
const ORIGIN = { userId: '1', runId: 'r', threadId: 2 };
const answer = (text: string): unknown => ({
  content: [{ type: 'text', text }],
  usage: { input_tokens: 1, output_tokens: 1 },
});

describe('the model’s answer, checked against the question', () => {
  it('keeps a known change whose word stands in the question', () => {
    const question = 'იცნობ კარგ იურისტს? მეგობარს სჭირდება.';
    expect(factChangeFromAnswer('{"change":"beneficiary","word":"მეგობარს"}', question)).toEqual({
      change: FactChange.Beneficiary,
      word: 'მეგობარს',
    });
  });

  it('drops a word that is not in the question — it cannot invent one', () => {
    expect(factChangeFromAnswer('{"change":"time","word":"შარშან"}', 'წელს?')).toBeNull();
  });

  it('reads „none", an unknown kind or no JSON as no change', () => {
    expect(factChangeFromAnswer('{"change":"none"}', 'x')).toBeNull();
    expect(factChangeFromAnswer('{"change":"tone","word":"x"}', 'x')).toBeNull();
    expect(factChangeFromAnswer('no', 'x')).toBeNull();
  });
});

describe('reading the question', () => {
  beforeEach(() => create.mockReset());

  it('asks the small model with the owner’s lines and the question', async () => {
    create.mockResolvedValue(answer('{"change":"detail","word":"ავეჯის"}'));
    const changed = await factChangedIn(
      'ტვირთის (ავეჯის) ჩამოტანა შეგიძლია?',
      ['ტვირთი მაქვს ჩამოსატანი'],
      ORIGIN,
    );
    expect(changed).toEqual({ change: FactChange.Detail, word: 'ავეჯის' });
    const [request] = create.mock.calls[0] as [{ messages: { content: string }[] }];
    expect(request.messages[0]?.content).toContain('OWNER:\nტვირთი მაქვს ჩამოსატანი');
  });

  it('holds nothing back when the model fails', async () => {
    create.mockRejectedValue(new Error('timeout'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await factChangedIn('იგივე ბუღალტერი?', ['ბუღალტერი მჭირდება'], ORIGIN)).toBeNull();
  });

  it('makes no call without the owner’s lines', async () => {
    expect(await factChangedIn('იცნობ?', [], ORIGIN)).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
});

describe('what the model is told', () => {
  it('to rewrite with the owner’s facts, and not to report it', () => {
    const text = factChangedRefusal({ change: FactChange.Beneficiary, word: 'for a friend' });
    expect(text).toContain('Not sent');
    expect(text).toContain('they are asking for themselves');
    expect(text).toContain('Do not tell the owner about this');
  });

  it('is checked before the ask goes out', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const handler = chat.slice(chat.indexOf("case 'ask_contact': {"));
    const checkAt = handler.indexOf('const changed = await factChangedIn(question, ownerLines, {');
    expect(checkAt).toBeGreaterThan(0);
    expect(checkAt).toBeLessThan(handler.indexOf('await createAsk('));
    expect(chat).toContain('FACTS: keep every fact exactly as the owner wrote it');
  });
});
