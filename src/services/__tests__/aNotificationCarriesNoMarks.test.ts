/**
 * Tester 1060/1061: a phone draws a notification as plain text, so bold stars
 * and heading hashes the model writes would show raw. The model-written title
 * and body go through the same mechanical scrub as a chat reply.
 */
const mockCreate = jest.fn();
const mockQuery = jest.fn();
const mockPush = jest.fn();

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
jest.mock('../costLedger.service', () => ({ recordClaudeUsage: () => Promise.resolve() }));
jest.mock('../userProfile.service', () => ({ getUserProfile: () => Promise.resolve({}) }));
jest.mock('../userPrivateContext.service', () => ({
  getPrivateContext: () => Promise.resolve({}),
}));

import { sendAiNotification } from '../aiNotification.service';

const USER_ID = '173985';

function modelWrites(title: string, body: string): void {
  // The prefill supplies the opening brace; the model continues from there.
  const rest = JSON.stringify({ title, body }).slice(1);
  mockCreate.mockResolvedValue({ content: [{ type: 'text', text: rest }], usage: {} });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockImplementation((sql: string) =>
    Promise.resolve({ rows: sql.includes('RETURNING id') ? [{ id: 1 }] : [] }),
  );
  mockPush.mockResolvedValue(undefined);
});

describe('sendAiNotification', () => {
  it('sends the title and body without bold stars or heading hashes', async () => {
    modelWrites('**ნინო** გელოდება', '# ახალი კონტაქტი — ნახე');

    await sendAiNotification(USER_ID);

    expect(mockPush).toHaveBeenCalledWith(USER_ID, {
      title: 'ნინო გელოდება',
      body: 'ახალი კონტაქტი, ნახე',
    });
  });

  it('sends plain text unchanged', async () => {
    modelWrites('ნინო გელოდება', 'ახალი კონტაქტი შენს ქსელში');

    await sendAiNotification(USER_ID);

    expect(mockPush).toHaveBeenCalledWith(USER_ID, {
      title: 'ნინო გელოდება',
      body: 'ახალი კონტაქტი შენს ქსელში',
    });
  });
});
