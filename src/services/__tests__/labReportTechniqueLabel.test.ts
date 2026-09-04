jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../referralLink.service', () => ({ __esModule: true, getReferralFunnel: jest.fn() }));

import { query } from '../../db/postgres/client';
import { buildLabReport } from '../labReport.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

// Ticket 9 task 22: a stored 0 means "explicitly none", and printed as a bare
// number next to counts it read as "zero asks" — which is how the 2 September
// report was misread.
describe('technique labels in the lab report', () => {
  it('prints 0 as "none" and null as "unknown", beside the raw values', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('GROUP BY technique_when'))
        return Promise.resolve({
          rows: [
            {
              technique_when: 0,
              technique_how: 5,
              technique_reason: null,
              asked: '5',
              agreed: '0',
              told: '0',
              joined: '0',
            },
          ],
          rowCount: 1,
        } as never);
      return Promise.resolve({ rows: [], rowCount: 0 } as never);
    });

    const report = await buildLabReport();
    const row = report.technique_conversion[0];

    expect(row?.technique_when).toBe(0);
    expect(row?.technique_when_label).toBe('none');
    expect(row?.technique_how_label).toBe('5');
    expect(row?.technique_reason_label).toBe('unknown');
    // The count stays a count — five asks, not zero.
    expect(row?.asked).toBe(5);
  });
});
