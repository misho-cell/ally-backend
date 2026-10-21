jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
const mockRun = jest.fn().mockResolvedValue({ records: [] });
const mockClose = jest.fn().mockResolvedValue(undefined);
jest.mock('../../db/neo4j/client', () => ({
  __esModule: true,
  getSession: jest.fn(() => ({ run: mockRun, close: mockClose })),
}));
jest.mock('../neo4j.keys', () => ({
  __esModule: true,
  getCompositeKeysForUsers: jest.fn(),
}));

import { query } from '../../db/postgres/client';
import { getCompositeKeysForUsers } from '../neo4j.keys';
import {
  backfillReverseTies,
  REVERSE_TIE_SOURCE,
  tieMemberToHolders,
  tieSavedMembersToSaver,
} from '../reverseTies.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockKeys = getCompositeKeysForUsers as jest.MockedFunction<typeof getCompositeKeysForUsers>;
const rows = (data: unknown[], rowCount = data.length): never =>
  ({ rows: data, rowCount }) as never;

const NEW_MEMBER = 191010;
const INVITER = 564;
const OTHER_HOLDER = 598;

/** Reads in the order the service asks: the switch, then the holders. */
function switchOnWithHolders(): void {
  mockQuery
    .mockResolvedValueOnce(rows([{ enabled: true }]))
    .mockResolvedValueOnce(
      rows([
        { user_id: INVITER, name: 'Iro', phone: '+995500000001' },
        { user_id: OTHER_HOLDER, name: 'George', phone: '+995500000002' },
      ]),
    )
    .mockResolvedValueOnce(rows([], 2));
  mockKeys.mockResolvedValue(
    new Map([
      [NEW_MEMBER, '+995500000009'],
      [INVITER, '+995500000001'],
      [OTHER_HOLDER, '+995500000002'],
    ]),
  );
}

beforeEach(() => jest.clearAllMocks());

/**
 * #7162 (D868): 12 of 20 launch joiners uploaded nothing, so every search
 * from them found no one — although each was invited by somebody who has them
 * saved. Everyone holding the member's number becomes a tie of theirs.
 */
describe('reverse ties', () => {
  it('write nothing while the switch is off', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ enabled: false }]));

    await expect(tieMemberToHolders(NEW_MEMBER)).resolves.toBe(0);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('give the new member every holder — the inviter among them — as a contact of their own', async () => {
    switchOnWithHolders();

    await expect(tieMemberToHolders(NEW_MEMBER)).resolves.toBe(2);

    const [sql, params] = mockQuery.mock.calls[2] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO "UserAlias"');
    expect(sql).toContain('NOT EXISTS');
    expect(params).toEqual([
      NEW_MEMBER,
      ['+995500000001', '+995500000002'],
      ['Iro', 'George'],
      REVERSE_TIE_SOURCE,
    ]);
  });

  it('draw the same ties in the graph, without renaming one the member saved', async () => {
    switchOnWithHolders();

    await tieMemberToHolders(NEW_MEMBER);

    const [cypher, params] = mockRun.mock.calls[0] as [string, { edges: unknown[] }];
    expect(cypher).toContain('MERGE (m)-[r:CONTACT]->(h)');
    expect(cypher).toContain('ON CREATE SET r.name');
    expect(params.edges).toEqual([
      { key: '+995500000001', name: 'Iro' },
      { key: '+995500000002', name: 'George' },
    ]);
    expect(mockClose).toHaveBeenCalled();
  });

  it('write nothing for a member nobody has saved', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ enabled: true }])).mockResolvedValueOnce(rows([]));

    await expect(tieMemberToHolders(NEW_MEMBER)).resolves.toBe(0);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('after an import, tie each member among the saved numbers to the saver', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ enabled: true }]))
      .mockResolvedValueOnce(rows([{ user_id: NEW_MEMBER }]));
    switchOnWithHolders();

    await expect(tieSavedMembersToSaver(INVITER, ['+995500000009'])).resolves.toBe(2);
    const [, params] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(params).toEqual([['+995500000009'], INVITER]);
  });

  it('a dry backfill counts and writes nothing', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ user_id: NEW_MEMBER }, { user_id: INVITER }]))
      .mockResolvedValueOnce(rows([{ user_id: INVITER, name: 'Iro', phone: '+995500000001' }]))
      .mockResolvedValueOnce(rows([]));

    await expect(backfillReverseTies(true)).resolves.toEqual({
      dry_run: true,
      members: 2,
      members_with_holders: 1,
      ties: 1,
    });
    expect(mockRun).not.toHaveBeenCalled();
    for (const [sql] of mockQuery.mock.calls as [string][]) expect(sql).not.toContain('INSERT');
  });

  it('lets a database error reach the caller', async () => {
    mockQuery.mockRejectedValueOnce(new Error('down'));

    await expect(tieMemberToHolders(NEW_MEMBER)).rejects.toThrow('down');
  });
});
