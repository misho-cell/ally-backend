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

  it('is never called unsent when this run sent an ask on another goal (4159, conv 48452)', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const guard = chat.slice(chat.indexOf('const instructionUnsent ='));
    expect(guard.slice(0, 900)).toContain('!runAskSent.has(runId) &&');
  });

  /** The tester's 49809: a closed route ended on „not sent — write it again". */
  it('is never called unsent when the run’s introduction met a closed route (1697)', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const guard = chat.slice(chat.indexOf('const instructionUnsent ='));
    expect(guard.slice(0, 1_100)).toContain('!runRouteClosed.has(runId) &&');
    expect(chat).toContain('noteRouteClosed(runId, block.name, rawResult);');
    expect(chat).toContain("const ROUTE_CLOSED_REASON = 'route_closed';");
    const tool = readFileSync(join(__dirname, '..', 'tools', 'requestIntroduction.ts'), 'utf8');
    expect(tool).toContain("reason: 'route_closed'");
  });

  it('says plainly that nothing went when the second chance sent nothing either', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    // §97: the server first asks the one named contact; only then the plain line.
    expect(chat).toContain('finalText = await serverSendsOrSaysSo(userId, threadId, runId);');
    expect(chat).toContain('return NOT_SENT_LINE[language];');
    for (const line of Object.values(NOT_SENT_LINE)) {
      expect(line).not.toMatch(/[—–]/u);
      expect(line.length).toBeGreaterThan(0);
    }
  });

  it('does not take a refused introduction for a sent question (44884)', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      "[...ACTING_TOOLS].filter((name) => name !== 'ask_contact' && name !== 'request_introduction')",
    );
    expect(
      chat.match(/!toolNamesUsed\.some\(\(name\) => ACTED_BY_NAME\.has\(name\)\)/gu),
    ).toHaveLength(2);
  });
});

describe('an introduction from this conversation counts as sent (2708)', () => {
  it('reads introduction requests by the conversation they came from', () => {
    const source = readFileSync(join(__dirname, '..', 'instructionUnsent.ts'), 'utf8');
    expect(source).toContain(
      'AND NOT EXISTS (SELECT 1 FROM introduction_requests r WHERE r.origin_thread_id = $1)',
    );
  });
});

describe('what is not an order to ask a contact (2906)', () => {
  it('leaves an email or a calendar entry to the run', () => {
    expect(
      contactInstructionIn(
        'გაუგზავნე იმეილი მაკა ბუღალტერს, რომ ხვალ შევხვდებით, და ჩამიწერე ეს შეხვედრა კალენდარში ხვალ 15:00-ზე.',
      ),
    ).toBeNull();
    expect(contactInstructionIn('Send an email to Maka that we meet tomorrow')).toBeNull();
  });

  it('reads „tell me" as said to Netai, not as an order to ask', () => {
    expect(
      contactInstructionIn(
        'Tell me in one or two sentences each what you know about Nika Kurieri, Gvantsa, Sulkhan and Ia from my contacts.',
      ),
    ).toBeNull();
  });

  it('still reads an order to ask, with or without „tell me" after it', () => {
    expect(contactInstructionIn(CASE_1)).not.toBeNull();
    expect(contactInstructionIn('Ask Gia whether he knows a plumber and tell me')).not.toBeNull();
    expect(
      contactInstructionIn('ჰკითხე გიას, იცნობს თუ არა სანტექნიკს, და მითხარი'),
    ).not.toBeNull();
  });
});

describe('a preview request is no instruction to send (2906)', () => {
  it.each([
    'ჯერ მაჩვენე, რას მისწერ ნინოს',
    'Show me first what you will write to Nino',
    'Покажи, что ты напишешь Нино',
  ])('„%s" is not sent and gets no dead-end line', (line) =>
    expect(contactInstructionIn(line)).toBeNull(),
  );

  it('the plain instruction still is one', () => {
    expect(contactInstructionIn('ჰკითხე ნინოს, იცნობს თუ არა კარგ ნოტარიუსს')).not.toBeNull();
  });
});
