import { readFileSync } from 'fs';
import { join } from 'path';

const mockQuery = jest.fn();
const mockNamesOwnContact = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));
jest.mock('../tools/nameMatch', () => ({
  messageNamesOwnContact: (...args: unknown[]) => mockNamesOwnContact(...args),
}));

import { contactInstructionIn, instructionLeftUnsent, NOT_SENT_LINE } from '../instructionUnsent';

/**
 * The tester's 44364 (case 1, runs 5 and 6): the owner's instruction to ask
 * one of their own contacts ended in „I'll ask", or in the question written
 * back to the owner, and nobody was asked.
 */
const CASE_1 =
  'მეყავს ნაცნობი გია ბერიძე, ორბიში CFO-ა. ჰკითხე Netai Test Lado N1-ს იცნობს თუ არა ' +
  'გია ბერიძეს და გამაცნობს თუ არა';

beforeEach(() => {
  mockQuery.mockReset();
  mockNamesOwnContact.mockReset();
});

describe('an owner instruction left unsent', () => {
  it('reads case 1 as an instruction to ask one contact', () => {
    expect(contactInstructionIn(CASE_1)).not.toBeNull();
    expect(contactInstructionIn('მჭირდება კარგი ბუღალტერი თბილისში')).toBeNull();
  });

  it('is unsent when the line names an own contact and nothing went from the conversation', async () => {
    mockNamesOwnContact.mockResolvedValue(true);
    mockQuery.mockResolvedValue({ rows: [{ silent: true }] });
    await expect(instructionLeftUnsent('178445', 42242, CASE_1)).resolves.toBe(true);
    expect(mockQuery.mock.calls[0][1]).toEqual([42242]);
  });

  it('is not unsent once something went from the conversation', async () => {
    mockNamesOwnContact.mockResolvedValue(true);
    mockQuery.mockResolvedValue({ rows: [{ silent: false }] });
    await expect(instructionLeftUnsent('178445', 42242, CASE_1)).resolves.toBe(false);
  });

  it('is not unsent when nobody in the phonebook is named', async () => {
    mockNamesOwnContact.mockResolvedValue(false);
    await expect(instructionLeftUnsent('178445', 42242, CASE_1)).resolves.toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('accuses nobody when the read fails', async () => {
    mockNamesOwnContact.mockResolvedValue(true);
    mockQuery.mockRejectedValue(new Error('timeout'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(instructionLeftUnsent('178445', 42242, CASE_1)).resolves.toBe(false);
  });

  it('gives the run one more turn with the instruction note', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('? INSTRUCTION_UNSENT_NUDGE');
    expect(chat).toContain(
      "(await instructionLeftUnsent(userId, threadId, runOwnerLine.get(runId) ?? ''))",
    );
    expect(chat).toMatch(/helperQuestionUnsent \|\|\s+instructionUnsent \|\|/u);
  });

  it('says plainly that nothing went when the second chance sent nothing either', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('finalText = NOT_SENT_LINE[runLang(runId)];');
    for (const line of Object.values(NOT_SENT_LINE)) {
      expect(line).not.toMatch(/[—–]/u);
      expect(line.length).toBeGreaterThan(0);
    }
  });
});
