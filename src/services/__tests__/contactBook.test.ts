jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../tools/membership', () => ({
  __esModule: true,
  fetchAccountStates: jest.fn(),
  isMemberPhone: jest.fn(),
}));
jest.mock('../mcp/contactRef', () => ({
  __esModule: true,
  encodeContactRef: jest.fn((_user: string, phone: string) => `c_${phone.length}`),
}));

import { query } from '../../db/postgres/client';
import { fetchAccountStates, isMemberPhone } from '../tools/membership';
import { contactPage, decodeCursor, encodeCursor, likePattern } from '../contactBook.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockStates = fetchAccountStates as jest.MockedFunction<typeof fetchAccountStates>;
const mockMember = isMemberPhone as jest.MockedFunction<typeof isMemberPhone>;

beforeEach(() => {
  mockQuery.mockReset();
  mockStates.mockResolvedValue(new Map());
  mockMember.mockImplementation((_m, phone) => phone.endsWith('1'));
});

/** The frontend's 06:30Z item 4: „ჩემი კონტაქტები", option ა (box 50854). */
describe('the cursor and the search text', () => {
  it('round-trips a position and refuses anything else', () => {
    expect(decodeCursor(encodeCursor(150))).toBe(150);
    expect(decodeCursor(null)).toBe(0);
    expect(decodeCursor(Buffer.from('-3').toString('base64url'))).toBeNull();
    expect(decodeCursor('not-a-cursor')).toBeNull();
  });

  it('searches the typed characters literally, never as a pattern', () => {
    expect(likePattern(' ნინო ')).toBe('%ნინო%');
    expect(likePattern('50%_off')).toBe('%50\\%\\_off%');
    expect(likePattern('   ')).toBeNull();
  });
});

describe('contactPage', () => {
  it('shows the saved name, the full number and the Netai mark (D772), and says when more follow', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { phone: '+995599000001', alias: 'ნინო' },
        { phone: '+995599000002', alias: '123' },
        { phone: '+995599000003', alias: 'გია' },
      ],
    } as never);

    const page = await contactPage(171, { q: 'ი', limit: 2, cursor: null });

    expect(page).toEqual({
      contacts: [
        { id: 'c_13', name: 'ნინო', phone: '+995599000001', on_netai: true },
        { id: 'c_13', name: null, phone: '+995599000002', on_netai: false },
      ],
      next_cursor: encodeCursor(2),
    });
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('"ContactDeceased"');
    expect(params).toEqual([171, '%ი%', 0, 3]);
  });

  it('answers the last page without a next cursor, and null for a foreign cursor', async () => {
    mockQuery.mockResolvedValue({ rows: [{ phone: '+995599000001', alias: 'ნინო' }] } as never);
    await expect(
      contactPage(171, { q: null, limit: 50, cursor: encodeCursor(50) }),
    ).resolves.toMatchObject({ next_cursor: null });
    await expect(contactPage(171, { q: null, limit: 50, cursor: '!!' })).resolves.toBeNull();
  });
});
