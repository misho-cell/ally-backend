jest.mock('../../labelParser.service', () => ({
  __esModule: true,
  getLabelQueueForUser: jest.fn(),
  getLabelQueueTotalForUser: jest.fn().mockResolvedValue(567),
}));

import { getLabelQueueForUser } from '../../labelParser.service';
import { decodeContactRef } from '../contactRef';
import { mcpGetUnresolvedLabels } from '../handlers';

const mockGetQueue = getLabelQueueForUser as jest.MockedFunction<typeof getLabelQueueForUser>;

beforeAll(() => {
  process.env.MCP_REF_SECRET = 'test-secret-for-unresolved-labels';
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('mcpGetUnresolvedLabels (ticket 6, 24 Aug: no raw phone across this boundary)', () => {
  it('never lets a raw phone number appear anywhere in the response', async () => {
    mockGetQueue.mockResolvedValue([
      { phone: '+995500111333', alias: 'Nika Besos Dzma' },
      { phone: '+995500111222', alias: 'Zura Santeqnikosi' },
    ]);

    const out = (await mcpGetUnresolvedLabels('170751', {})) as {
      entries: { contact_ref: string; alias: string }[];
    };

    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain('+995500111333');
    expect(serialized).not.toContain('+995500111222');
    expect(out.entries).toHaveLength(2);
    for (const entry of out.entries) expect(entry.contact_ref.startsWith('c_')).toBe(true);
  });

  it('the returned contact_ref decodes back to the real phone for the SAME user', async () => {
    mockGetQueue.mockResolvedValue([{ phone: '+995500111333', alias: 'Nika Besos Dzma' }]);

    const out = (await mcpGetUnresolvedLabels('170751', {})) as {
      entries: { contact_ref: string }[];
    };

    expect(decodeContactRef('170751', out.entries[0].contact_ref)).toBe('+995500111333');
  });

  it('defaults the limit to 20 and caps it at 100', async () => {
    mockGetQueue.mockResolvedValue([]);

    await mcpGetUnresolvedLabels('170751', {});
    expect(mockGetQueue).toHaveBeenCalledWith('170751', 20);

    await mcpGetUnresolvedLabels('170751', { limit: 500 });
    expect(mockGetQueue).toHaveBeenCalledWith('170751', 100);
  });
});
