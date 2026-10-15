jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { ownerLineNamesThisContact } from '../taskAsks.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

const OWNER = '118509';
const TORNIKE = '+995 599 00 00 01';
const OTHER = '+995 599 00 00 02';

/**
 * #5182 (Giorgi, 15 Oct, thread 52292): the plan wall refused his new plan as
 * „your own instruction is the permission" while the ask wall refused the ask,
 * so nothing went. Both walls now ask the same question.
 */
describe('does the owner’s line name exactly this contact', () => {
  beforeEach(() => jest.clearAllMocks());

  it('yes, when the owner’s own label for this phone is in the instruction', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ phone: TORNIKE, alias: 'Tornike Abuladze' }],
      rowCount: 1,
    } as never);
    await expect(
      ownerLineNamesThisContact('ჰკითხე Tornike Abuladze-ს, იცნობს თუ არა ერეკლეს', {
        fromUserId: OWNER,
        contactPhone: TORNIKE,
      }),
    ).resolves.toBe(true);
  });

  it('no, when the label in the line is somebody else’s', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ phone: OTHER, alias: 'Tornike Abuladze' }],
      rowCount: 1,
    } as never);
    await expect(
      ownerLineNamesThisContact('ჰკითხე Tornike Abuladze-ს', {
        fromUserId: OWNER,
        contactPhone: TORNIKE,
      }),
    ).resolves.toBe(false);
  });

  it('no, and no throw, when the phonebook cannot be read', async () => {
    mockQuery.mockRejectedValue(new Error('timeout'));
    await expect(
      ownerLineNamesThisContact('ჰკითხე Tornike Abuladze-ს', {
        fromUserId: OWNER,
        contactPhone: TORNIKE,
      }),
    ).resolves.toBe(false);
  });

  it('is the test the plan wall uses for the one person a plan adds', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'if (added.length === 1) return await lineNamesTheAddedPerson(userId, said, added[0]);',
    );
    expect(chat).toContain(
      'return ownerLineNamesThisContact(said, { fromUserId: userId, contactPhone: phone });',
    );
  });
});
