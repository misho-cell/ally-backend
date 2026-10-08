const mockFindPhones = jest.fn();
const mockCreateAsk = jest.fn();
const mockOpenTask = jest.fn();
const mockCreateTask = jest.fn();
const mockGrant = jest.fn();
jest.mock('../tools/nameMatch', () => ({
  findContactPhonesByName: (...a: unknown[]) => mockFindPhones(...a),
  messageNamesOwnContact: jest.fn(),
}));
const mockExcluded = jest.fn().mockResolvedValue(false);
jest.mock('../block.service', () => ({
  isDeceasedOrBlockedFor: (...a: unknown[]) => mockExcluded(...a),
}));
jest.mock('../taskAsks.service', () => ({ createAsk: (...a: unknown[]) => mockCreateAsk(...a) }));
jest.mock('../taskStore.service', () => ({
  getOpenTaskByThread: (...a: unknown[]) => mockOpenTask(...a),
  createTask: (...a: unknown[]) => mockCreateTask(...a),
  grantTaskPermission: (...a: unknown[]) => mockGrant(...a),
}));
const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({ query: (...a: unknown[]) => mockQuery(...a) }));

import { InstructedAskResult, sendInstructedAsk } from '../instructedAsk';
import { EXCLUDED_LINE, NOT_ON_NETAI_LINE } from '../instructionUnsent';

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
      result: InstructedAskResult.Sent,
      toName: 'გიგა ტესტაძე',
    });
    expect(mockFindPhones.mock.calls[0][1]).toBe('გიგა ტესტაძეს');
    expect(mockGrant).toHaveBeenCalledWith('178582', 77);
    expect(mockCreateAsk).toHaveBeenCalledWith(
      '178582',
      77,
      '995500000001',
      // QA-001 (conv 42765): the question only — not the context, not „ask <name>".
      'იცნობს თუ არა გია ბერიძეს და გამაცნობს თუ არა',
      undefined,
      42485,
      undefined,
      undefined,
      undefined,
      true,
    );
  });

  it('sends nothing when the name matches two contacts', async () => {
    mockFindPhones.mockResolvedValue(['995500000001', '995500000002']);
    await expect(sendInstructedAsk('178582', 42485, CASE_1)).resolves.toEqual({
      result: InstructedAskResult.NotSent,
    });
    expect(mockCreateAsk).not.toHaveBeenCalled();
  });

  it('sends nothing for a line that is no instruction', async () => {
    await expect(sendInstructedAsk('178582', 42485, 'მჭირდება ბუღალტერი')).resolves.toEqual({
      result: InstructedAskResult.NotSent,
    });
    expect(mockFindPhones).not.toHaveBeenCalled();
  });

  it('names a person who is not on Netai by the owner’s own label (T2509)', async () => {
    mockFindPhones.mockResolvedValue(['995500000001']);
    mockCreateAsk.mockResolvedValue({ sent: false, reason: 'recipient_not_member', error: 'x' });
    mockQuery.mockResolvedValue({ rows: [{ alias: 'გიგა ხელოსანი' }] });

    await expect(sendInstructedAsk('178582', 42485, CASE_1)).resolves.toEqual({
      result: InstructedAskResult.NotOnNetai,
      toName: 'გიგა ხელოსანი',
    });
    // 45155: the label is read by the number's digits, as the name search returns them.
    expect(String(mockQuery.mock.calls[0][0])).toContain("regexp_replace(phone, '\\D', '', 'g')");
    expect(NOT_ON_NETAI_LINE.ka('გიგა ხელოსანი')).toBe(
      'გიგა ხელოსანი Netai-ზე ჯერ არ არის, ამიტომ კითხვა ვერ გავუგზავნე. შეგიძლია მოიწვიო ან თავად მისწერო.',
    );
  });

  it('says plainly „not sent" for any other refusal', async () => {
    mockFindPhones.mockResolvedValue(['995500000001']);
    mockCreateAsk.mockResolvedValue({ sent: false, reason: 'daily_cap_reached', error: 'x' });
    await expect(sendInstructedAsk('178582', 42485, CASE_1)).resolves.toEqual({
      result: InstructedAskResult.NotSent,
    });
  });
});

describe('3268: a person the owner marked deceased or blocked', () => {
  it('is not asked, no goal is opened, and the owner is told by the label', async () => {
    mockFindPhones.mockResolvedValue(['995500000001']);
    mockExcluded.mockResolvedValue(true);
    mockQuery.mockResolvedValue({ rows: [{ alias: 'გიგა ტესტაძე' }] });

    await expect(sendInstructedAsk('178582', 42485, CASE_1)).resolves.toEqual({
      result: InstructedAskResult.Excluded,
      toName: 'გიგა ტესტაძე',
    });
    expect(mockCreateTask).not.toHaveBeenCalled();
    expect(mockCreateAsk).not.toHaveBeenCalled();
  });

  it('the line asks nothing to be repeated', () => {
    expect(EXCLUDED_LINE.ka('გიგა ტესტაძე')).toContain('გიგა ტესტაძე-სთვის არაფერს ვწერ');
    expect(EXCLUDED_LINE.ka('გიგა ტესტაძე')).not.toContain('კიდევ ერთხელ');
  });
});
