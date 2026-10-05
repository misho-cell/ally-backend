jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../block.service', () => ({
  __esModule: true,
  getExcludedPhoneSet: jest.fn().mockResolvedValue(new Set()),
}));
jest.mock('../taskAsks.service', () => ({
  __esModule: true,
  sendApprovedAskAnswer: jest.fn().mockResolvedValue({ sent: true }),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { sendApprovedAskAnswer } from '../taskAsks.service';
import {
  ownerLineSharesNumber,
  shareContactNumberWithAsker,
  ShareRefusal,
} from '../shareNumber.service';

/**
 * Board #991 (the founder, 4 October): „if the user approves giving out a
 * number to his friend, that is not a problem." On his own typed word, for a
 * contact in his own phonebook, the number goes to the person who asked.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSend = sendApprovedAskAnswer as jest.MockedFunction<typeof sendApprovedAskAnswer>;
const rows = (list: readonly Record<string, unknown>[]): void => {
  mockQuery.mockResolvedValueOnce({ rows: list, rowCount: list.length } as never);
};

beforeEach(() => {
  mockQuery.mockReset();
  mockSend.mockClear();
});

describe('the owner’s own line', () => {
  it('names the contact in a sentence and speaks of a number', () => {
    expect(
      ownerLineSharesNumber(
        'კი, გაუგზავნე დათოს ნომერი, ჩემი ტელეფონის წიგნიდან აიღე',
        'დათო ხელოსანი',
      ),
    ).toBe(true);
    expect(ownerLineSharesNumber("Yes, send him Nino's phone", 'Nino Beridze')).toBe(true);
  });

  it('is not enough without a number word, or for another name', () => {
    expect(ownerLineSharesNumber('კი, დათოს ჰკითხე', 'დათო ხელოსანი')).toBe(false);
    expect(ownerLineSharesNumber('გაუგზავნე ნინოს ნომერი', 'დათო ხელოსანი')).toBe(false);
  });
});

describe('sharing a number with the person who asked', () => {
  it('refuses when there is no open question to this owner', async () => {
    rows([]);
    await expect(shareContactNumberWithAsker('501', 40, '995599000111')).resolves.toEqual({
      shared: false,
      reason: ShareRefusal.NoLiveQuestion,
    });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('refuses a number that is not in the owner’s own phonebook', async () => {
    rows([{ id: 9 }]);
    rows([]);
    await expect(shareContactNumberWithAsker('501', 40, '995599000111')).resolves.toEqual({
      shared: false,
      reason: ShareRefusal.NotOwnContact,
    });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('refuses when the owner’s own latest line does not say so', async () => {
    rows([{ id: 9 }]);
    rows([{ alias: 'დათო ხელოსანი' }]);
    rows([{ content: 'კი, დათოს ჰკითხე' }]);
    await expect(shareContactNumberWithAsker('501', 40, '995599000111')).resolves.toEqual({
      shared: false,
      reason: ShareRefusal.NotTheOwnersWord,
    });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sends the name and the number, marked to be shown, exactly as built', async () => {
    rows([{ id: 9 }]);
    rows([{ alias: 'დათო ხელოსანი' }]);
    rows([{ content: 'კი, გაუგზავნე დათოს ნომერი' }]);
    await expect(shareContactNumberWithAsker('501', 40, '995599000111')).resolves.toEqual({
      shared: true,
      name: 'დათო ხელოსანი',
    });
    expect(mockSend).toHaveBeenCalledWith('501', 40, 'დათო ხელოსანი: ⟦own⟧995599000111⟦/own⟧', {
      verbatim: true,
    });
  });

  /** Tester 39931: an answer already delivered — the tool said „sent", nothing arrived. */
  it('says the question was already answered when the number could not travel', async () => {
    rows([{ id: 9 }]);
    rows([{ alias: 'დათო ხელოსანი' }]);
    rows([{ content: 'კი, გაუგზავნე დათოს ნომერი' }]);
    mockSend.mockResolvedValueOnce({ sent: false, already_delivered: true, error: 'x' });
    await expect(shareContactNumberWithAsker('501', 40, '995599000111')).resolves.toEqual({
      shared: false,
      reason: ShareRefusal.AlreadyAnswered,
    });
  });
});

describe('the tool', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('is held only in a question thread, and only in a turn the owner is in', () => {
    expect(chat).toContain('...(ownerAbsent ? [] : [SHARE_CONTACT_NUMBER_TOOL]),');
    expect(chat).toContain("case 'share_contact_number_with_asker': {");
  });

  it('tells the model never to type the number and to offer matches as buttons', () => {
    expect(chat).toContain('first offer the matches with present_choices');
    expect(chat).toContain('never type the number yourself');
  });
});

/** The tester's 37456 (1): the asker's run read the number in its answer event. */
describe('the asker’s answer event', () => {
  it('carries a placeholder where the shared number stood; the card shows the number', () => {
    const { buildShownAnswersWakeEvent } = jest.requireActual('../taskAsks.service');
    const event: string = buildShownAnswersWakeEvent([
      { answer: 'დათო ხელოსანი: ⟦own⟧995599000111⟦/own⟧', fromName: 'გია', verbatim: true },
    ]);
    expect(event).toContain('დათო ხელოსანი: [ნომერი ბარათზე ჩანს]');
    expect(event).not.toContain('995599000111');
  });
});
