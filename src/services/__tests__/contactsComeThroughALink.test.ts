const mockQuery = jest.fn();
const mockImport = jest.fn();
const mockParse = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...args: unknown[]) => mockQuery(...args),
  default: { end: jest.fn() },
}));
jest.mock('../contacts.service', () => ({
  importContacts: (...args: unknown[]) => mockImport(...args),
  parseVcf: (...args: unknown[]) => mockParse(...args),
}));

import crypto from 'crypto';
import {
  createUploadLink,
  EmptyVcfError,
  UploadLinkClosedError,
  importWholeFile,
  startUploadThroughLink,
} from '../contactUploadLinks.service';

const contacts = (n: number): { name: string; phone: string }[] =>
  Array.from({ length: n }, (_, i) => ({
    name: `Test ${i}`,
    phone: `+99550000${String(i).padStart(4, '0')}`,
  }));

/** #5744 (A), the founder's D822: contacts reach Netai through a one-time link, never the chat. */
describe('the contacts upload link', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockImport.mockReset();
    mockParse.mockReset();
  });

  it('is a public link whose token is stored only as its hash', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ expires_at: '2026-10-18T13:30:00Z' }] });
    const link = await createUploadLink('501');

    expect(link.url).toMatch(/^https:\/\/api\.netai\.guru\/contacts-upload\/[A-Za-z0-9_-]{30,}$/u);
    const token = link.url.split('/').pop() ?? '';
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe(crypto.createHash('sha256').update(token).digest('hex'));
    expect(params).not.toContain(token);
  });

  it('loads a 1,900-contact file whole, in as many rounds as the 500 cap needs', async () => {
    mockParse.mockReturnValue(contacts(1900));
    mockImport
      .mockResolvedValueOnce({ imported: 500, skipped: 0, unchanged: 0, remaining: 1400 })
      .mockResolvedValueOnce({ imported: 500, skipped: 0, unchanged: 500, remaining: 900 })
      .mockResolvedValueOnce({ imported: 500, skipped: 0, unchanged: 1000, remaining: 400 })
      .mockResolvedValueOnce({ imported: 400, skipped: 0, unchanged: 1500, remaining: 0 });

    await expect(importWholeFile('501', 'BEGIN:VCARD')).resolves.toEqual({
      imported: 1900,
      unchanged: 0,
      skipped: 0,
      inFile: 1900,
    });
    expect(mockImport).toHaveBeenCalledTimes(4);
  });

  it('refuses a used or expired link', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(startUploadThroughLink('t'.repeat(32), 'BEGIN:VCARD')).rejects.toBeInstanceOf(
      UploadLinkClosedError,
    );
    expect(mockImport).not.toHaveBeenCalled();
  });

  it('gives the link back when the file holds no contacts, so the member can try again', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: 501 }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    mockParse.mockReturnValue([]);

    await expect(startUploadThroughLink('t'.repeat(32), 'nothing')).rejects.toBeInstanceOf(
      EmptyVcfError,
    );
    const [sql] = mockQuery.mock.calls[1] as [string];
    expect(sql).toContain('SET used_at = NULL');
  });

  it('answers at once with the file’s count, and loads in the background (the tester’s 67194)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 501 }] });
    mockParse.mockReturnValue(contacts(1900));
    let finish: (value: unknown) => void = () => undefined;
    mockImport.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );

    await expect(startUploadThroughLink('t'.repeat(32), 'BEGIN:VCARD')).resolves.toEqual({
      inFile: 1900,
    });
    expect(mockImport).toHaveBeenCalledTimes(1);
    finish({ imported: 1900, skipped: 0, unchanged: 0, remaining: 0 });
  });
});
