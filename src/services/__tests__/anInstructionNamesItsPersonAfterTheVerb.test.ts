jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { instructionAddressee } from '../goalIntent';
import { messageNamesOwnContact } from '../tools/nameMatch';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => jest.clearAllMocks());

/**
 * The tester's notes to 1101 (32982): „მჭირდება სანდო მძღოლი ხვალ აეროპორტში
 * … ჰკითხე ჩემს ნაცნობებს." was read as naming one person — „მძღოლი" from the
 * need matched a contact label — and the plan was refused twice.
 */
describe('the person an instruction names', () => {
  it('is in the words after the verb, in the same sentence', () => {
    expect(instructionAddressee('ჰკითხე ლაშა მძღოლს, რომელ სერვისს ურჩევდა.')).toBe(
      'ლაშა მძღოლს რომელ სერვისს ურჩევდა',
    );
    expect(instructionAddressee('ჰკითხე კიდევ ერთ ადამიანს: მაკა მასწავლებელი')).toContain(
      'მაკა მასწავლებელი',
    );
  });

  it('is nobody when the instruction addresses a group', () => {
    expect(
      instructionAddressee(
        'მჭირდება სანდო მძღოლი ხვალ აეროპორტში წასასვლელად. ჰკითხე ჩემს ნაცნობებს.',
      ),
    ).toBe('');
    expect(instructionAddressee('Ask my friends.')).toBe('');
  });

  it('is undefined (null) when the line has no instruction verb', () => {
    expect(instructionAddressee('მჭირდება იურისტი')).toBeNull();
  });
});

describe('messageNamesOwnContact', () => {
  it('does not read the phonebook for a group instruction, and says no', async () => {
    expect(
      await messageNamesOwnContact(
        '41',
        'მჭირდება სანდო მძღოლი ხვალ აეროპორტში. ჰკითხე ჩემს ნაცნობებს.',
      ),
    ).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('matches only the words after the verb', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ hit: 1 }], rowCount: 1 } as never);
    expect(await messageNamesOwnContact('41', 'მჭირდება მძღოლი. ჰკითხე ნინოს.')).toBe(true);
    const patterns = (mockQuery.mock.calls[0][1] as string[]).slice(1).join(' ');
    expect(patterns).toContain('ნინ');
    expect(patterns).not.toContain('მძღოლ');
  });
});
