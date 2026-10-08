jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: jest.fn() } },
}));
jest.mock('../costLedger.service', () => ({ recordClaudeUsage: jest.fn(() => Promise.resolve()) }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import anthropic from '../../config/anthropic';
import {
  composePreparedAnswer,
  preparedAnswerBrief,
  preparedAnswerLine,
  usablePreparedLine,
} from '../preparedAnswer.service';

/** 1695 (A12, §107): a likely fit sees one prepared line under „yes". */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockCreate = anthropic.messages.create as unknown as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('the brief', () => {
  it('is §107 word for word', () => {
    const doc = readFileSync(
      join(__dirname, '..', '..', '..', 'docs', 'ADMIN_WRITE_OPERATIONS.md'),
      'utf8',
    );
    const approved = doc
      .slice(doc.indexOf('**§107'))
      .split('\n')
      .find((line) => line.startsWith('> From the facts below'));
    expect(approved?.slice(2).split('{language}').join('Georgian')).toBe(preparedAnswerBrief('ka'));
  });
});

describe('the line', () => {
  it('is one short line with no number in it', () => {
    expect(usablePreparedLine('საბაჟოს ბროკერი ვარ, ნინოს დავეხმარები.')).toBe(
      'საბაჟოს ბროკერი ვარ, ნინოს დავეხმარები.',
    );
    expect(usablePreparedLine('დამირეკე 599 12 34 56')).toBeNull();
    expect(usablePreparedLine('nothing')).toBeNull();
    expect(usablePreparedLine('ერთი\nორი')).toBeNull();
    expect(usablePreparedLine('x'.repeat(201))).toBeNull();
  });

  it('is composed from his own profile fields only — never his notes', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ job: 'საბაჟოს ბროკერი', employer: 'Test LLC' }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'საბაჟოს ბროკერი ვარ, შემიძლია დახმარება.' }],
      usage: {},
    });
    expect(await composePreparedAnswer(9101, 'იცნობ საბაჟოს ბროკერს?', 'ka')).toBe(
      'საბაჟოს ბროკერი ვარ, შემიძლია დახმარება.',
    );
    for (const call of mockQuery.mock.calls) expect(String(call[0])).not.toContain('user_notes');
    const sent = JSON.parse(mockCreate.mock.calls[0][0].messages[0].content as string);
    expect(sent.facts).toEqual(['job: საბაჟოს ბროკერი', 'employer: Test LLC']);
  });

  it('nothing is composed for a reader with no profile', async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);
    expect(await composePreparedAnswer(9103, 'იცნობ საბაჟოს ბროკერს?', 'ka')).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('is shown under the question with what yes sends', () => {
    expect(preparedAnswerLine('ka', 'კი, ვიცნობ', 'საბაჟოს ბროკერი ვარ.')).toBe(
      '„კი, ვიცნობ"-ს დაჭერით გაიგზავნება: „საბაჟოს ბროკერი ვარ."',
    );
  });
});

describe('the wiring', () => {
  it('only a likely_yes first ask gets a line; it is stored for him; yes sends it', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).toContain('prematch?.word === PrematchWord.LikelyYes');
    expect(asks).toContain('field, prepared_answer)');
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain("thread.type === 'incoming_ask'");
    expect(chat).toContain('const sent = await sendApprovedAskAnswer(userId, threadId, prepared);');
  });
});
