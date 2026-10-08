jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: jest.fn() } },
}));
jest.mock('../costLedger.service', () => ({ recordClaudeUsage: jest.fn(() => Promise.resolve()) }));

import { readFileSync } from 'fs';
import { join } from 'path';
import anthropic from '../../config/anthropic';
import { checkedOwnerButtons, ownerButtonsBrief, usableButtons } from '../ownerButtons.service';

/**
 * 2579, first part (§105): the owner's buttons after an answer card read
 * „დიახ, სთხოვენ გაცნობა" / „არა, არაა ახლა ველოდოთ ლევანს" (conv 43319).
 */
const mockCreate = anthropic.messages.create as unknown as jest.Mock;
const verdict = (input: unknown): unknown => ({
  content: [{ type: 'tool_use', name: 'give_verdict', id: 't1', input }],
  usage: { input_tokens: 1, output_tokens: 1 },
});
const MESSAGE = 'გინდა, ბახვას სთხოვო ნინო გამოგონილთან გაცნობა?';
const BROKEN = ['დიახ, სთხოვენ გაცნობა', 'არა, არაა ახლა ველოდოთ ლევანს', 'სხვა, მე დავწერ'];

beforeEach(() => jest.clearAllMocks());

describe('the brief', () => {
  it('is §105 word for word, with the language named', () => {
    const doc = readFileSync(
      join(__dirname, '..', '..', '..', 'docs', 'ADMIN_WRITE_OPERATIONS.md'),
      'utf8',
    );
    const approved = doc
      .slice(doc.indexOf('**§105'))
      .split('\n')
      .find((line) => line.startsWith('> You check the buttons'));
    expect(approved?.slice(2).split('{language}').join('Georgian')).toBe(ownerButtonsBrief('ka'));
  });
});

describe('the check', () => {
  it('fixes the model’s buttons and never sends the server’s own', async () => {
    mockCreate.mockResolvedValue(
      verdict({ ok: false, buttons: ['კი, სთხოვე გაცნობა', 'არა, ჯერ ლევანს დაველოდოთ'] }),
    );
    expect(await checkedOwnerButtons(MESSAGE, BROKEN, 'ka')).toEqual([
      'კი, სთხოვე გაცნობა',
      'არა, ჯერ ლევანს დაველოდოთ',
      'სხვა, მე დავწერ',
    ]);
    const sent = JSON.parse(mockCreate.mock.calls[0][0].messages[0].content as string);
    expect(sent.buttons).toEqual(BROKEN.slice(0, 2));
  });

  it('keeps them as written when they pass, or the check fails', async () => {
    mockCreate.mockResolvedValueOnce(verdict({ ok: true }));
    expect(await checkedOwnerButtons(MESSAGE, BROKEN, 'ka')).toEqual(BROKEN);
    mockCreate.mockRejectedValueOnce(new Error('timeout'));
    const quiet = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await checkedOwnerButtons(MESSAGE, BROKEN, 'ka')).toEqual(BROKEN);
    quiet.mockRestore();
  });

  it('asks nothing when every button is the server’s own', async () => {
    expect(await checkedOwnerButtons(MESSAGE, ['სხვა, მე დავწერ'], 'ka')).toEqual([
      'სხვა, მე დავწერ',
    ]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('refuses a rewrite with another count, an empty or long button, or a repeat', () => {
    const sent = ['a', 'b'];
    expect(usableButtons({ ok: false, buttons: ['x'] }, sent)).toBeNull();
    expect(usableButtons({ ok: false, buttons: ['x', ''] }, sent)).toBeNull();
    expect(usableButtons({ ok: false, buttons: ['x', 'y'.repeat(41)] }, sent)).toBeNull();
    expect(usableButtons({ ok: false, buttons: ['x', 'x'] }, sent)).toBeNull();
    expect(usableButtons({ ok: false, buttons: ['x', 'y'] }, sent)).toEqual(['x', 'y']);
  });

  it('runs on every owner reply with buttons, after the reply guards', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'choices = await checkedOwnerButtons(finalText, choices, runLang(runId));',
    );
  });
});
