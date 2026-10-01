/**
 * Plate v301 G6, second half: whether there is a number to hand over, read
 * the way the accept reads it.
 */
jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../notification.service', () => ({ __esModule: true, sendPushNotification: jest.fn() }));
jest.mock('../productEvents.service', () => ({ __esModule: true, recordProductEvent: jest.fn() }));
jest.mock('../threadStatus.service', () => ({ __esModule: true, setThreadStatus: jest.fn() }));
jest.mock('../threads.service', () => ({
  __esModule: true,
  getThreadsByIntroRequestId: jest.fn().mockResolvedValue([]),
  saveThreadMessage: jest.fn(),
  createThread: jest.fn(),
  userLanguage: jest.fn().mockResolvedValue('en'),
}));
jest.mock('../debrief.service', () => ({ __esModule: true, armIntroDebrief: jest.fn() }));
jest.mock('../taskEngine.service', () => ({ __esModule: true, startIntroOutcome: jest.fn() }));
jest.mock('../tools/nameMatch', () => ({ __esModule: true, findContactPhonesByName: jest.fn() }));

import { query } from '../../db/postgres/client';
import { mediatorCanHandOver } from '../introduction.service';
import { findContactPhonesByName } from '../tools/nameMatch';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockMatches = findContactPhonesByName as jest.MockedFunction<typeof findContactPhonesByName>;

function request(fields: Record<string, unknown>): void {
  mockQuery.mockResolvedValueOnce({
    rows: [{ id: 7, target_name: 'Sandro', target_phone: null, target_user_id: null, ...fields }],
  } as never);
}

beforeEach(() => {
  mockQuery.mockReset();
  mockMatches.mockReset();
});

describe('mediatorCanHandOver', () => {
  it('is true when the request already carries a number', async () => {
    request({ target_phone: '+995 599 00 00 00' });

    expect(await mediatorCanHandOver('551', 7)).toBe(true);
  });

  it("is true when the target's own account has a phone", async () => {
    request({ target_user_id: 900 });
    mockQuery.mockResolvedValueOnce({ rows: [{ phone: 'x' }] } as never);

    expect(await mediatorCanHandOver('551', 7)).toBe(true);
  });

  it('is true on exactly one match in his phonebook', async () => {
    request({});
    mockMatches.mockResolvedValueOnce(['p1']);

    expect(await mediatorCanHandOver('551', 7)).toBe(true);
  });

  it('is false on none, and on two — a wrong match would disclose a third person', async () => {
    request({});
    mockMatches.mockResolvedValueOnce([]);
    expect(await mediatorCanHandOver('551', 7)).toBe(false);

    request({});
    mockMatches.mockResolvedValueOnce(['p1', 'p2']);
    expect(await mediatorCanHandOver('551', 7)).toBe(false);
  });

  it('is null when the request is not his', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    expect(await mediatorCanHandOver('551', 7)).toBeNull();
  });
});
