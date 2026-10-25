const mockFindPhones = jest.fn();
const mockCreateAsk = jest.fn();
const mockOpenTask = jest.fn();
const mockCreateTask = jest.fn();
const mockGrant = jest.fn();
const mockRepeated = jest.fn();
jest.mock('../tools/nameMatch', () => ({
  findContactPhonesByName: (...a: unknown[]) => mockFindPhones(...a),
  messageNamesOwnContact: jest.fn(),
}));
const mockExcluded = jest.fn().mockResolvedValue(false);
jest.mock('../block.service', () => ({
  isDeceasedOrBlockedFor: (...a: unknown[]) => mockExcluded(...a),
}));
const mockCanBeAsked = jest.fn();
jest.mock('../taskAsks.service', () => ({
  createAsk: (...a: unknown[]) => mockCreateAsk(...a),
  canBeAsked: (...a: unknown[]) => mockCanBeAsked(...a),
}));
jest.mock('../taskStore.service', () => ({
  getOpenTaskByThread: (...a: unknown[]) => mockOpenTask(...a),
  createTask: (...a: unknown[]) => mockCreateTask(...a),
  grantTaskPermission: (...a: unknown[]) => mockGrant(...a),
  findOpenTaskNamedIn: (...a: unknown[]) => mockRepeated(...a),
}));
const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({ query: (...a: unknown[]) => mockQuery(...a) }));

import { contactsNamed, InstructedAskResult, sendInstructedAsk } from '../instructedAsk';
import { EXCLUDED_LINE, NOT_ON_NETAI_LINE } from '../instructionUnsent';

/** §97 item 1: case 1's second chance sent nothing; the server asks the one named contact. */
const CASE_1 =
  'მეყავს ნაცნობი გია ბერიძე, ორბიში CFO-ა. ჰკითხე გიგა ტესტაძეს იცნობს თუ არა გია ' +
  'ბერიძეს და გამაცნობს თუ არა';

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  mockOpenTask.mockResolvedValue(null);
  mockRepeated.mockResolvedValue(null);
  mockCreateTask.mockResolvedValue({ id: 77 });
  mockGrant.mockResolvedValue(true);
  mockCreateAsk.mockResolvedValue({ sent: true, ask_id: 9, to_name: 'გიგა ტესტაძე' });
});

describe('the server asks the one contact the owner named', () => {
  it('opens the goal, grants from the instruction and sends the owner’s question', async () => {
    mockFindPhones.mockResolvedValue(['995500000001']);

    await expect(sendInstructedAsk('178582', 42485, CASE_1)).resolves.toMatchObject({
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

  it('sends nothing, and opens no goal, for a line that names whom to ask but not what (4687)', async () => {
    mockFindPhones.mockResolvedValue(['995599000001']);
    mockCanBeAsked.mockResolvedValue('ok');
    await expect(sendInstructedAsk('165699', 24996, 'ლიკას კითხე')).resolves.toEqual({
      result: InstructedAskResult.NotSent,
    });
    expect(mockFindPhones).toHaveBeenCalled();
    expect(mockCreateAsk).not.toHaveBeenCalled();
    expect(mockCreateTask).not.toHaveBeenCalled();
    expect(mockGrant).not.toHaveBeenCalled();
  });

  it('says the person is not on Netai, not „write it again", when the line names no question (58847)', async () => {
    mockFindPhones.mockResolvedValue(['995599000002']);
    mockCanBeAsked.mockResolvedValue('never_opened');
    mockQuery.mockResolvedValue({ rows: [{ alias: 'ნინო ლომიძე' }] });

    await expect(sendInstructedAsk('184775', 51846, 'კი, ნინოს ჰკითხე')).resolves.toMatchObject({
      result: InstructedAskResult.NotOnNetai,
      toName: 'ნინო ლომიძე',
    });
    expect(mockCreateAsk).not.toHaveBeenCalled();
    expect(mockCreateTask).not.toHaveBeenCalled();
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

    await expect(sendInstructedAsk('178582', 42485, CASE_1)).resolves.toMatchObject({
      result: InstructedAskResult.NotOnNetai,
      toName: 'გიგა ხელოსანი',
    });
    // 45155: the label is read by the number's digits, as the name search returns them.
    expect(String(mockQuery.mock.calls[0][0])).toContain(
      "regexp_replace(ua.phone, '\\D', '', 'g')",
    );
    expect(NOT_ON_NETAI_LINE.ka('გიგა ხელოსანი')).toBe(
      'გიგა ხელოსანი Netai-ზე ჯერ არ არის, ამიტომ კითხვა ვერ გავუგზავნე. შეგიძლია მოიწვიო ან თავად მისწერო.',
    );
  });

  it('names an account that never opened Netai cleanly, not by a messy label (#7631, 65721)', async () => {
    mockFindPhones.mockResolvedValue(['995500000001']);
    mockCreateAsk.mockResolvedValue({ sent: false, reason: 'recipient_not_member', error: 'x' });
    mockQuery.mockResolvedValue({ rows: [{ alias: 'Nika B. (gym)', registered: 'Nika Beridze' }] });
    await expect(sendInstructedAsk('178582', 42485, CASE_1)).resolves.toMatchObject({
      result: InstructedAskResult.NotOnNetai,
      toName: 'Nika Beridze',
    });
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

    await expect(sendInstructedAsk('178582', 42485, CASE_1)).resolves.toMatchObject({
      result: InstructedAskResult.Excluded,
      toName: 'გიგა ტესტაძე',
    });
    expect(mockCreateTask).not.toHaveBeenCalled();
    expect(mockCreateAsk).not.toHaveBeenCalled();
  });

  it('the line asks nothing to be repeated', () => {
    expect(EXCLUDED_LINE.ka('გიგა ტესტაძე')).toContain('გიგა ტესტაძესთვის არაფერს ვწერ');
    expect(EXCLUDED_LINE.ka('Giga Testadze')).toContain('Giga Testadze-სთვის');
    expect(EXCLUDED_LINE.ka('გიგა ტესტაძე')).not.toContain('კიდევ ერთხელ');
  });
});

/** 3928 (GP-052 step 3, seat 181490): two people named, a repeated need in a new conversation. */
describe('a line that names two people', () => {
  const LINE = 'სანტექნიკოსი მჭირდება, ჰკითხე ნიკა დამხმარე-ას და სოფო დამხმარე-ბს.';

  beforeEach(() => {
    mockFindPhones.mockImplementation((_u: string, name: string) =>
      Promise.resolve(name.startsWith('ნიკა') ? ['995500000011'] : ['995500000012']),
    );
    mockCreateAsk
      .mockResolvedValueOnce({ sent: true, ask_id: 1, to_name: 'ნიკა დამხმარე-ა' })
      .mockResolvedValueOnce({ sent: true, ask_id: 2, to_name: 'სოფო დამხმარე-ბ' });
  });

  it('asks both, with the need as the question — never the names', async () => {
    const outcome = await sendInstructedAsk('181490', 47871, LINE);
    expect(outcome).toMatchObject({ result: InstructedAskResult.Sent, toName: 'ნიკა დამხმარე-ა' });
    expect(mockCreateAsk).toHaveBeenCalledTimes(2);
    expect(mockCreateAsk.mock.calls.map((c) => c[2])).toEqual(['995500000011', '995500000012']);
    expect(mockCreateAsk.mock.calls.map((c) => c[3])).toEqual([
      'სანტექნიკოსი მჭირდება',
      'სანტექნიკოსი მჭირდება',
    ]);
    expect(outcome.result === InstructedAskResult.NotSent ? [] : outcome.people).toHaveLength(2);
  });

  it('asks under this conversation’s own goal, never one from another conversation (3928 run 2)', async () => {
    mockRepeated.mockResolvedValue({ id: 23181 });
    await sendInstructedAsk('181490', 47871, LINE);
    expect(mockCreateTask).toHaveBeenCalledTimes(1);
    expect(mockCreateTask.mock.calls[0][4]).toBe(47871);
    expect(mockCreateAsk.mock.calls[0][1]).not.toBe(23181);
  });

  it('sends nothing when one of the names is not one saved contact', async () => {
    mockFindPhones.mockImplementation((_u: string, name: string) =>
      Promise.resolve(name.startsWith('ნიკა') ? ['995500000011'] : []),
    );
    await expect(sendInstructedAsk('181490', 47871, LINE)).resolves.toEqual({
      result: InstructedAskResult.NotSent,
    });
    expect(mockCreateAsk).not.toHaveBeenCalled();
  });
});

/** 3961: a meeting goes to the one person it names, the meeting itself as the question. */
describe('a meeting the owner asks to set up', () => {
  it('asks Nanuli about the meeting, never the whole line', async () => {
    mockFindPhones.mockResolvedValue(['995500000021']);
    mockCreateAsk.mockResolvedValue({ sent: true, ask_id: 3, to_name: 'ნანული მოგონილი' });
    const outcome = await sendInstructedAsk(
      '181480',
      47860,
      'შეხვედრა დამინიშნე ნანული მოგონილთან ხვალ 3 საათზე.',
    );
    expect(outcome).toMatchObject({ result: InstructedAskResult.Sent, toName: 'ნანული მოგონილი' });
    expect(mockFindPhones.mock.calls[0][1]).toBe('ნანული მოგონილ');
    expect(mockCreateAsk.mock.calls[0][3]).toBe('შეხვედრა ხვალ 3 საათზე.');
  });
});

/** 3928 re-run (box 49146, conv 48289): full surname datives, no hyphen. */
describe('the tester’s second line', () => {
  it('names both helpers, each one saved contact', async () => {
    mockFindPhones.mockImplementation((_u: string, name: string) =>
      Promise.resolve(name.startsWith('ლაშა') ? ['995500000031'] : ['995500000032']),
    );
    await expect(
      contactsNamed(
        '181941',
        'კარგი ელექტრიკოსი მჭირდება საბურთალოზე, ჰკითხე ლაშა მილიძეს და დათო ტრუბაძეს.',
      ),
    ).resolves.toEqual([
      { phone: '995500000031', typed: 'ლაშა მილიძე' },
      { phone: '995500000032', typed: 'დათო ტრუბაძე' },
    ]);
  });
});

/**
 * 2311 (tester box 56931, after 0253): the introduction was refused by the
 * dormant guard and this send then carried „დამაკავშიროს ლევან კაპანაძესთან."
 * to a go-between who never opened the app.
 */
describe('an introduction is never sent as a plain question', () => {
  it.each([
    'სთხოვე გელა ბერიძეს, დამაკავშიროს ლევან კაპანაძესთან.',
    'გელა ბერიძეს სთხოვე, რომ დამაკავშიროს ლევან კაპანაძესთან.',
    'სთხოვე გელა ბერიძეს, გამაცნოს ლევან კაპანაძე.',
  ])('„%s" sends nothing and opens no goal', async (line) => {
    mockFindPhones.mockResolvedValue(['995500000001']);
    await expect(sendInstructedAsk('184245', 51184, line)).resolves.toEqual({
      result: InstructedAskResult.NotSent,
    });
    expect(mockCreateAsk).not.toHaveBeenCalled();
    expect(mockCreateTask).not.toHaveBeenCalled();
  });

  it('sends the introduction half of a mixed message to nobody as a question (box 54175)', async () => {
    mockFindPhones.mockResolvedValue(['995500000001']);
    const out = await sendInstructedAsk(
      '178582',
      42485,
      'სთხოვე ნინოს, გამაცნოს რეზო. ასევე ჰკითხე გელას, ხომ არ იცნობს სხვა ინვესტორს.',
    );
    expect(out.result).toBe(InstructedAskResult.NotSent);
    expect(mockCreateAsk).not.toHaveBeenCalled();
  });
});

/**
 * 4888 (Lika's phone, 13 Oct): the question that reaches the helper is built
 * from the owner's current line, never from an older goal on the same thread.
 */
describe('the question is always the line just typed', () => {
  it('asks about the photographer even when an older goal is open on the thread', async () => {
    mockFindPhones.mockResolvedValue(['995500000001']);
    mockOpenTask.mockResolvedValue({ id: 88, title: 'დღეს საღამოს თუ სცალია' });
    await sendInstructedAsk('160584', 51035, 'ჰკითხე სალომეს, კარგ ფოტოგრაფს ხომ არ იცნობს');
    expect(mockCreateAsk).toHaveBeenCalledTimes(1);
    const question = String(mockCreateAsk.mock.calls[0][3]);
    expect(question).toContain('ფოტოგრაფ');
    expect(question).not.toContain('საღამოს');
  });
});
