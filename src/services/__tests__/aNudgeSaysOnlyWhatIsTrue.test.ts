/**
 * #8252 (a real member, 28 Oct): the morning nudge invented a referral in broken
 * polite Georgian, and the chat its tap opened did not hold it. With nothing
 * true to say there is no nudge; a nudge that goes is written into its chat.
 */
const mockCreate = jest.fn();
const mockQuery = jest.fn();
const mockPush = jest.fn();
const mockSave = jest.fn();

jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: (...args: unknown[]) => mockCreate(...args) } },
}));
jest.mock('../../db/postgres/client', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));
jest.mock('../notification.service', () => ({
  sendPushNotification: (...args: unknown[]) => mockPush(...args),
}));
jest.mock('../threads.service', () => ({
  saveServerLine: (...args: unknown[]) => mockSave(...args),
}));
jest.mock('../sse.service', () => ({ emitMessageAppended: jest.fn() }));
jest.mock('../costLedger.service', () => ({ recordClaudeUsage: () => Promise.resolve() }));
jest.mock('../userProfile.service', () => ({ getUserProfile: () => Promise.resolve({}) }));
jest.mock('../userPrivateContext.service', () => ({
  getPrivateContext: () => Promise.resolve({}),
}));

import { sendAiNotification } from '../aiNotification.service';

const USER_ID = '173985';
const THREAD_ID = 4242;

function modelWrites(json: Record<string, unknown>): void {
  const rest = JSON.stringify(json).slice(1);
  mockCreate.mockResolvedValue({ content: [{ type: 'text', text: rest }], usage: {} });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockImplementation((sql: string) =>
    Promise.resolve({
      rows: sql.includes('RETURNING id')
        ? [{ id: 1 }]
        : sql.includes('thread_id FROM (')
          ? [{ thread_id: THREAD_ID }]
          : [],
    }),
  );
  mockPush.mockResolvedValue(undefined);
  mockSave.mockResolvedValue({ id: 9, content: 'x', createdAt: '2026-10-28T05:00:00.000Z' });
});

describe('the morning nudge (#8252)', () => {
  it('sends nothing when the model has nothing true to say', async () => {
    modelWrites({ skip: true });
    await sendAiNotification(USER_ID);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    expect(
      mockQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO ai_notification_log')),
    ).toBe(false);
  });

  it('is written into the chat its push opens', async () => {
    modelWrites({ title: 'ნინო პასუხს გელოდება', body: 'შენს კითხვაზე ჯერ არ უპასუხია.' });
    await sendAiNotification(USER_ID);
    expect(mockSave).toHaveBeenCalledWith(
      THREAD_ID,
      Number(USER_ID),
      'ნინო პასუხს გელოდება\nშენს კითხვაზე ჯერ არ უპასუხია.',
    );
    expect(mockPush).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ url: `/chat/${THREAD_ID}` }),
    );
  });

  it('tells the model to invent nothing, to say „შენ", and to skip', () => {
    const { readFileSync } = jest.requireActual<typeof import('fs')>('fs');
    const { join } = jest.requireActual<typeof import('path')>('path');
    const src = readFileSync(join(__dirname, '..', 'aiNotification.service.ts'), 'utf8');
    expect(src).toContain('არაფერი გამოიგონო');
    expect(src).toContain('არასოდეს „თქვენ"-ით');
    expect(src).toContain('{"skip": true}');
    expect(src).not.toContain('ინტრიგული');
  });
});
