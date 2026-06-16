jest.mock('../../db/postgres/client', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
  default: { query: jest.fn() },
  __esModule: true,
}));

jest.mock('../../db/neo4j/client', () => ({
  getSession: jest.fn(),
}));

import { withTransaction as _withTransaction } from '../../db/postgres/client';
import pool from '../../db/postgres/client';
import { getSession } from '../../db/neo4j/client';
import { getUserPhone, importContacts, parseVcf, createUserPhoneNode } from '../contacts.service';

const mockPoolQuery = pool.query as jest.Mock;
const mockWithTransaction = _withTransaction as jest.Mock;
const mockGetSession = getSession as jest.Mock;

const makeSession = () => ({
  run: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
});

const makeTransactionClient = () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockReturnValue(makeSession());
  mockWithTransaction.mockImplementation(async (cb: (c: object) => Promise<void>) =>
    cb(makeTransactionClient()),
  );
});

// ─── getUserPhone ────────────────────────────────────────────────────────────

describe('getUserPhone', () => {
  it('returns phone when user exists', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ phone: '+995555123456' }], rowCount: 1 });

    const phone = await getUserPhone('42');

    expect(phone).toBe('+995555123456');
    expect(mockPoolQuery).toHaveBeenCalledWith(expect.stringContaining('UserPhone'), ['42']);
  });

  it('throws when user has no phone', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(getUserPhone('99')).rejects.toThrow('User phone not found');
  });
});

// ─── importContacts ──────────────────────────────────────────────────────────

describe('importContacts', () => {
  const userPhone = '+995555000001';

  beforeEach(() => {
    mockPoolQuery.mockResolvedValue({ rows: [{ phone: userPhone }], rowCount: 1 });
  });

  it('imports valid contacts and returns counts', async () => {
    const contacts = [{ name: 'გიორგი', phones: ['+995555123456'] }];

    const result = await importContacts('1', contacts);

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(mockWithTransaction).toHaveBeenCalledTimes(1);
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

  it('skips contact with empty name', async () => {
    const contacts = [{ name: '  ', phones: ['+995555123456'] }];

    const result = await importContacts('1', contacts);

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('skips contact with no phones', async () => {
    const contacts = [{ name: 'ნინო', phones: [] }];

    const result = await importContacts('1', contacts);

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('skips phone without leading +', async () => {
    const contacts = [{ name: 'ნინო', phones: ['995555123456'] }];

    const result = await importContacts('1', contacts);

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('skips phone that matches the user own phone', async () => {
    const contacts = [{ name: 'Me', phones: [userPhone] }];

    const result = await importContacts('1', contacts);

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('skips on DB error without throwing', async () => {
    mockWithTransaction.mockRejectedValueOnce(new Error('DB error'));
    const contacts = [{ name: 'ლუკა', phones: ['+995555777888'] }];
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await importContacts('1', contacts);

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    consoleSpy.mockRestore();
  });

  it('imports multiple phones from one contact as separate entries', async () => {
    const contacts = [{ name: 'ანა', phones: ['+995555111111', '+995555222222'] }];

    const result = await importContacts('1', contacts);

    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
  });

  it('caps import at 500 contacts', async () => {
    const contacts = Array.from({ length: 600 }, (_, i) => ({
      name: `Contact ${i}`,
      phones: [`+1800${String(i).padStart(7, '0')}`],
    }));

    const result = await importContacts('1', contacts);

    expect(result.imported).toBe(500);
  });

  it('saves optional fields to Neo4j relationship', async () => {
    const contacts = [
      {
        name: 'ნინო',
        phones: ['+995555999000'],
        email: 'nino@test.ge',
        employer: 'TBC Bank',
        jobPosition: 'Engineer',
        city: 'Tbilisi',
      },
    ];

    await importContacts('1', contacts);

    const session = mockGetSession.mock.results[0].value;
    expect(session.run).toHaveBeenCalledWith(
      expect.stringContaining('MERGE'),
      expect.objectContaining({
        name: 'ნინო',
        email: 'nino@test.ge',
        employer: 'TBC Bank',
        jobPosition: 'Engineer',
        city: 'Tbilisi',
      }),
    );
  });
});

// ─── parseVcf ────────────────────────────────────────────────────────────────

describe('parseVcf', () => {
  it('parses a basic vCard', () => {
    const vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:გიორგი ბერიძე',
      'TEL;TYPE=CELL:+995555123456',
      'END:VCARD',
    ].join('\r\n');

    const result = parseVcf(vcf);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('გიორგი ბერიძე');
    expect(result[0].phones).toContain('+995555123456');
  });

  it('parses multiple vCards', () => {
    const vcf = [
      'BEGIN:VCARD\r\nFN:ნინო\r\nTEL:+995555000001\r\nEND:VCARD',
      'BEGIN:VCARD\r\nFN:ლუკა\r\nTEL:+995555000002\r\nEND:VCARD',
    ].join('\r\n');

    const result = parseVcf(vcf);

    expect(result).toHaveLength(2);
  });

  it('falls back to N field when FN is missing', () => {
    const vcf = 'BEGIN:VCARD\r\nN:ბერიძე;გიორგი;;;\r\nTEL:+995555123456\r\nEND:VCARD';

    const result = parseVcf(vcf);

    expect(result[0].name).toBeTruthy();
  });

  it('excludes vCard without TEL', () => {
    const vcf = 'BEGIN:VCARD\r\nFN:No Phone\r\nEMAIL:test@test.com\r\nEND:VCARD';

    const result = parseVcf(vcf);

    expect(result).toHaveLength(0);
  });

  it('excludes vCard without name', () => {
    const vcf = 'BEGIN:VCARD\r\nTEL:+995555123456\r\nEND:VCARD';

    const result = parseVcf(vcf);

    expect(result).toHaveLength(0);
  });

  it('extracts email', () => {
    const vcf = 'BEGIN:VCARD\r\nFN:Test\r\nTEL:+995555111\r\nEMAIL:test@example.com\r\nEND:VCARD';

    const result = parseVcf(vcf);

    expect(result[0].email).toBe('test@example.com');
  });

  it('extracts employer from ORG (ignores sub-units after semicolon)', () => {
    const vcf =
      'BEGIN:VCARD\r\nFN:Test\r\nTEL:+995555111\r\nORG:TBC Bank;Tech Division\r\nEND:VCARD';

    const result = parseVcf(vcf);

    expect(result[0].employer).toBe('TBC Bank');
  });

  it('extracts jobPosition from TITLE', () => {
    const vcf = 'BEGIN:VCARD\r\nFN:Test\r\nTEL:+995555111\r\nTITLE:Senior Engineer\r\nEND:VCARD';

    const result = parseVcf(vcf);

    expect(result[0].jobPosition).toBe('Senior Engineer');
  });

  it('extracts city from ADR (4th field)', () => {
    const vcf =
      'BEGIN:VCARD\r\nFN:Test\r\nTEL:+995555111\r\nADR:;;123 Main St;Tbilisi;;0179;Georgia\r\nEND:VCARD';

    const result = parseVcf(vcf);

    expect(result[0].city).toBe('Tbilisi');
  });

  it('handles CRLF line endings', () => {
    const vcf = 'BEGIN:VCARD\r\nFN:Test\r\nTEL:+995555111\r\nEND:VCARD';
    const result = parseVcf(vcf);
    expect(result).toHaveLength(1);
  });

  it('handles folded lines (continuation with space)', () => {
    const vcf = 'BEGIN:VCARD\r\nFN:გი\r\n ორგი\r\nTEL:+99555\r\n 5111\r\nEND:VCARD';
    const result = parseVcf(vcf);
    expect(result).toHaveLength(1);
  });

  it('returns empty array for empty string', () => {
    expect(parseVcf('')).toHaveLength(0);
  });

  it('strips spaces from phone numbers', () => {
    const vcf = 'BEGIN:VCARD\r\nFN:Test\r\nTEL:+995 555 123 456\r\nEND:VCARD';
    const result = parseVcf(vcf);
    expect(result[0].phones[0]).toBe('+995555123456');
  });
});

// ─── createUserPhoneNode ─────────────────────────────────────────────────────

describe('createUserPhoneNode', () => {
  it('runs MERGE query in Neo4j', async () => {
    await createUserPhoneNode('+995555123456');

    const session = mockGetSession.mock.results[0].value;
    expect(session.run).toHaveBeenCalledWith(expect.stringContaining('MERGE'), {
      phone: '+995555123456',
    });
    expect(session.close).toHaveBeenCalled();
  });

  it('logs error and does not throw when Neo4j fails', async () => {
    mockGetSession.mockReturnValueOnce({
      run: jest.fn().mockRejectedValue(new Error('Neo4j down')),
      close: jest.fn().mockResolvedValue(undefined),
    });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(createUserPhoneNode('+995555000000')).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
