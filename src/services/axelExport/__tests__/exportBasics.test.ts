import { exportPhoneHash } from '../exportHash';
import { toCsv } from '../csv';

/** The Axel export (Misho, 6 Oct): one stable keyed hash per number, and CSV a spreadsheet opens safely. */
describe('the phone hash', () => {
  const saved = process.env.MCP_REF_SECRET;
  beforeAll(() => {
    process.env.MCP_REF_SECRET = 'test-secret';
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.MCP_REF_SECRET;
    else process.env.MCP_REF_SECRET = saved;
  });

  it('is the same for every spelling of one number, and differs between numbers', () => {
    const a = exportPhoneHash('+995 599 00 00 01');
    expect(a).toMatch(/^[0-9a-f]{24}$/);
    expect(exportPhoneHash('995599000001')).toBe(a);
    expect(exportPhoneHash('995599000002')).not.toBe(a);
  });

  it('is empty for no number', () => {
    expect(exportPhoneHash(null)).toBe('');
    expect(exportPhoneHash('')).toBe('');
  });

  it('depends on the server secret, so it cannot be rebuilt from the number alone', () => {
    const before = exportPhoneHash('995599000001');
    process.env.MCP_REF_SECRET = 'another-secret';
    expect(exportPhoneHash('995599000001')).not.toBe(before);
    process.env.MCP_REF_SECRET = 'test-secret';
  });
});

describe('the CSV', () => {
  it('quotes what needs quoting and opens a formula as text', () => {
    const csv = toCsv(['a', 'b', 'c'], [{ a: 'Nino, Tbilisi', b: '=HYPERLINK("x")', c: null }]);
    expect(csv).toBe('a,b,c\r\n"Nino, Tbilisi","\'=HYPERLINK(""x"")",\r\n');
  });
});
