const mockFindPhones = jest.fn();
const mockCreateAsk = jest.fn();
jest.mock('../tools/nameMatch', () => ({
  findContactPhonesByName: (...a: unknown[]) => mockFindPhones(...a),
  messageNamesOwnContact: jest.fn(),
}));
jest.mock('../block.service', () => ({
  isDeceasedOrBlockedFor: jest.fn().mockResolvedValue(false),
}));
const mockCanBeAsked = jest.fn();
jest.mock('../taskAsks.service', () => ({
  createAsk: (...a: unknown[]) => mockCreateAsk(...a),
  canBeAsked: (...a: unknown[]) => mockCanBeAsked(...a),
}));
jest.mock('../taskStore.service', () => ({
  getOpenTaskByThread: jest.fn().mockResolvedValue(null),
  createTask: jest.fn().mockResolvedValue({ id: 77 }),
  grantTaskPermission: jest.fn().mockResolvedValue(true),
  findOpenTaskNamedIn: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../db/postgres/client', () => ({ query: jest.fn() }));

import { isInstructionSentence } from '../goalIntent';
import { sendInstructedAsk } from '../instructedAsk';
import { factsAround, questionWithFacts } from '../instructedFacts';

/** 1687 (box 48535): the tester's own line, conv 47556 — 588 characters, six facts after the ask. */
const ARCHITECT =
  'ჰკითხე თამარ გამოგონილს, ხომ არ იცნობს კარგ არქიტექტორს, რომელიც კერძო სახლის პროექტს ' +
  'გააკეთებს. ვაკეში ნაკვეთი მაქვს, დაახლოებით 600 კვადრატული მეტრი, ფერდობზეა და ქვემოთ ' +
  'ხევია, ამიტომ საძირკველი რთული იქნება. მინდა ორსართულიანი სახლი, ოთხი საძინებლით, დიდი ' +
  'მისაღებით და ტერასით, რომელიც ქალაქს გადაჰყურებს. ბიუჯეტი პროექტისთვის დაახლოებით 15 ' +
  'ათასი ლარია, მშენებლობა გაზაფხულზე უნდა დავიწყოთ. მნიშვნელოვანია, რომ არქიტექტორს ' +
  'ჰქონდეს ფერდობზე აშენებული სახლების გამოცდილება და შეეძლოს ნებართვების მომზადებაც ' +
  'მერიაში. სასურველია, რომ ინგლისურადაც ლაპარაკობდეს, რადგან ჩემი მეუღლე უცხოელია.';

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  mockCreateAsk.mockResolvedValue({ sent: true, ask_id: 9, to_name: 'თამარ გამოგონილი' });
});

describe('1687: the facts the owner wrote after his instruction go with the question', () => {
  it('sends every fact of the tester’s line, not the question alone', async () => {
    mockFindPhones.mockResolvedValue(['995500000001']);

    await sendInstructedAsk('181155', 47556, ARCHITECT);

    const question = mockCreateAsk.mock.calls[0][3] as string;
    for (const fact of [
      'ვაკეში',
      '600',
      'ფერდობზეა',
      'ოთხი საძინებლით',
      '15',
      'გაზაფხულზე',
      'ინგლისურადაც',
    ])
      expect(question).toContain(fact);
    expect(question).not.toContain('ჰკითხე');
    expect(question.length).toBeLessThanOrEqual(600);
  });

  it('never sends what the owner wrote BEFORE the instruction (QA-001)', () => {
    const line =
      'მეყავს ნაცნობი გია, ორბიში CFO-ა. ჰკითხე გიგას, იცნობს თუ არა გიას. ხვალ მჭირდება.';
    expect(factsAround(line, isInstructionSentence)).toEqual(['ხვალ მჭირდება.']);
  });

  it('adds whole sentences only, stopping before the limit', () => {
    expect(questionWithFacts('Q?', ['one.', 'two two.', 'three.'], 13)).toBe('Q? one.');
    expect(questionWithFacts('Q?', [], 600)).toBe('Q?');
  });
});
