const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({ query: (...a: unknown[]) => mockQuery(...a) }));
const mockVerdict = jest.fn();
jest.mock('../auth.service', () => ({ loginGateVerdict: (...a: unknown[]) => mockVerdict(...a) }));

import { admittedUserIdByPhone } from '../connectorAdmission.service';

const PHONE = '+995500000001';

/** 5419: the connector's sign-in asks the same invitation gate as the app's. */
describe('the connector door asks the invitation', () => {
  beforeEach(() => jest.resetAllMocks());

  it('admits an account the app sign-in admits', async () => {
    mockQuery.mockResolvedValue({ rows: [{ userId: 42 }] });
    mockVerdict.mockResolvedValue({ would_be_admitted: true });
    await expect(admittedUserIdByPhone(PHONE)).resolves.toBe('42');
    expect(mockVerdict).toHaveBeenCalledWith(42);
  });

  it('refuses a legacy account nobody invited while the gate is on', async () => {
    mockQuery.mockResolvedValue({ rows: [{ userId: 42 }] });
    mockVerdict.mockResolvedValue({ would_be_admitted: false });
    await expect(admittedUserIdByPhone(PHONE)).resolves.toBeNull();
  });

  it('refuses a number that is no account, without asking the gate', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await expect(admittedUserIdByPhone(PHONE)).resolves.toBeNull();
    expect(mockVerdict).not.toHaveBeenCalled();
  });

  it('looks the number up by its digits, whatever its format, under a timeout (#5743)', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await admittedUserIdByPhone(PHONE);
    const [sql, params, timeout] = mockQuery.mock.calls[0] as [string, unknown[], number];
    expect(sql).toContain("regexp_replace(phone, '\\D', '', 'g')");
    expect(params).toEqual([PHONE]);
    expect(timeout).toBeGreaterThan(0);
  });
});
