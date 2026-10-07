const mockFindPhones = jest.fn();
const mockCreateAsk = jest.fn();
const mockOpenTask = jest.fn();
const mockCreateTask = jest.fn();
const mockGrant = jest.fn();
jest.mock('../tools/nameMatch', () => ({
  findContactPhonesByName: (...a: unknown[]) => mockFindPhones(...a),
  messageNamesOwnContact: jest.fn(),
}));
jest.mock('../taskAsks.service', () => ({ createAsk: (...a: unknown[]) => mockCreateAsk(...a) }));
jest.mock('../taskStore.service', () => ({
  getOpenTaskByThread: (...a: unknown[]) => mockOpenTask(...a),
  createTask: (...a: unknown[]) => mockCreateTask(...a),
  grantTaskPermission: (...a: unknown[]) => mockGrant(...a),
}));
jest.mock('../../db/postgres/client', () => ({ query: jest.fn() }));

import { sendInstructedAsk } from '../instructedAsk';

/** §97 item 1: case 1's second chance sent nothing; the server asks the one named contact. */
const CASE_1 =
  'მეყავს ნაცნობი გია ბერიძე, ორბიში CFO-ა. ჰკითხე გიგა ტესტაძეს იცნობს თუ არა გია ' +
  'ბერიძეს და გამაცნობს თუ არა';

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  mockOpenTask.mockResolvedValue(null);
  mockCreateTask.mockResolvedValue({ id: 77 });
  mockGrant.mockResolvedValue(true);
  mockCreateAsk.mockResolvedValue({ sent: true, ask_id: 9, to_name: 'გიგა ტესტაძე' });
});

describe('the server asks the one contact the owner named', () => {
  it('opens the goal, grants from the instruction and sends the owner’s question', async () => {
    mockFindPhones.mockResolvedValue(['995500000001']);

    await expect(sendInstructedAsk('178582', 42485, CASE_1)).resolves.toEqual({
      toName: 'გიგა ტესტაძე',
    });
    expect(mockFindPhones.mock.calls[0][1]).toBe('გიგა ტესტაძეს');
    expect(mockGrant).toHaveBeenCalledWith('178582', 77);
    expect(mockCreateAsk).toHaveBeenCalledWith(
      '178582',
      77,
      '995500000001',
      CASE_1,
      undefined,
      42485,
    );
  });

  it('sends nothing when the name matches two contacts', async () => {
    mockFindPhones.mockResolvedValue(['995500000001', '995500000002']);
    await expect(sendInstructedAsk('178582', 42485, CASE_1)).resolves.toBeNull();
    expect(mockCreateAsk).not.toHaveBeenCalled();
  });

  it('sends nothing for a line that is no instruction', async () => {
    await expect(sendInstructedAsk('178582', 42485, 'მჭირდება ბუღალტერი')).resolves.toBeNull();
    expect(mockFindPhones).not.toHaveBeenCalled();
  });
});
