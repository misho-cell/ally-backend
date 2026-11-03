const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  __esModule: true,
  query: mockQuery,
  default: {},
}));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { keepUserMessage } from '../chat.service';
import { saveThreadMessage } from '../threads.service';
import { PERSONAL_ID_MASK } from '../personalIdMask';

const THREAD_ID = 50826;
const ID_LINE = 'ანა ბერიძე, 01001012345';
const MASKED_LINE = `ანა ბერიძე, ${PERSONAL_ID_MASK}`;

function insertParams(): unknown[] {
  const call = mockQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO conversations'));
  if (call === undefined) throw new Error('no conversation row was written');
  return (call as [string, unknown[]])[1];
}

/** #8618: an owner's personal ID number never reaches the conversation table. */
describe('personal ID numbers are not stored', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });
  });

  it('masks the ID in the owner line kept on arrival, text and json alike', async () => {
    await expect(keepUserMessage('501', THREAD_ID, ID_LINE)).resolves.toBe(true);
    const params = insertParams();
    expect(params[3]).toBe(MASKED_LINE);
    expect(params[4]).toBe(JSON.stringify(MASKED_LINE));
  });

  it('masks the ID in an owner line saved through the thread store', async () => {
    await saveThreadMessage(THREAD_ID, '501', 'user', ID_LINE);
    expect(insertParams()).toContain(MASKED_LINE);
    expect(JSON.stringify(insertParams())).not.toContain('01001012345');
  });

  it('fails as before when the write fails', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection terminated'));
    await expect(keepUserMessage('501', THREAD_ID, ID_LINE)).resolves.toBe(false);
  });
});
