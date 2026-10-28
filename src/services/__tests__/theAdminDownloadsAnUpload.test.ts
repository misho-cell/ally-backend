jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import ExcelJS from 'exceljs';
import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { fileForAdmin, MAX_FILES_LISTED, userFiles } from '../adminFiles.service';

/**
 * #8317 (desk C-32c, founder's priority 1): the admin lists a member's uploads
 * and downloads one as it was sent; an older file comes back rebuilt, and says so.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const rows = (r: unknown[]): never => ({ rows: r, rowCount: r.length }) as never;
const STORED = {
  filename: 'კომპანიები.xlsx',
  kind: 'table',
  columns: ['კომპანია', 'ქალაქი'],
  rows: [['TBC', 'თბილისი']],
  text_content: 'კომპანია ქალაქი',
};

beforeEach(() => jest.clearAllMocks());

describe('a member’s uploads (#8317)', () => {
  it('are listed newest first, bounded', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1882, filename: 'a.xlsx', has_original: false }]));
    expect(await userFiles(3318)).toEqual([{ id: 1882, filename: 'a.xlsx', has_original: false }]);
    expect(mockQuery.mock.calls[0][1]).toEqual([3318, MAX_FILES_LISTED]);
    expect(String(mockQuery.mock.calls[0][0])).toContain('ORDER BY created_at DESC');
  });

  it('come back as sent when the upload was kept', async () => {
    const bytes = Buffer.from('original bytes');
    mockQuery.mockResolvedValueOnce(
      rows([{ ...STORED, original: bytes, mime_type: 'application/vnd.ms-excel' }]),
    );
    expect(await fileForAdmin(1900)).toEqual({
      filename: 'კომპანიები.xlsx',
      mimeType: 'application/vnd.ms-excel',
      body: bytes,
      rebuilt: false,
    });
  });

  it('come back rebuilt from the read rows when only those were kept, and say so', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ ...STORED, original: null, mime_type: null }]));
    const file = await fileForAdmin(1882);
    expect(file?.rebuilt).toBe(true);
    expect(file?.filename).toBe('კომპანიები (rebuilt).xlsx');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file?.body as unknown as ArrayBuffer);
    const sheet = book.worksheets[0];
    expect(sheet.getRow(1).getCell(1).value).toBe('კომპანია');
    expect(sheet.getRow(2).getCell(1).value).toBe('TBC');
  });

  it('a text file comes back as text, and a missing one as null', async () => {
    mockQuery.mockResolvedValueOnce(
      rows([{ ...STORED, columns: [], rows: [], original: null, mime_type: null }]),
    );
    expect((await fileForAdmin(5))?.filename).toBe('კომპანიები (rebuilt).txt');
    mockQuery.mockResolvedValueOnce(rows([]));
    expect(await fileForAdmin(6)).toBeNull();
  });
});

describe('the routes and the upload (#8317)', () => {
  it('are GET /admin/users/:id/files and GET /admin/files/:id', () => {
    const admin = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    expect(admin).toContain("adminRouter.get('/users/:id/files'");
    expect(admin).toContain("adminRouter.get('/files/:id'");
    expect(admin).toContain("res.setHeader('X-Netai-Rebuilt', String(file.rebuilt));");
  });

  it('keeps the upload itself from now on', () => {
    const route = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'threadFiles.routes.ts'),
      'utf8',
    );
    expect(route).toContain(
      '{ bytes: upload.buffer, mimeType: upload.mimetype || DEFAULT_MIME_TYPE }',
    );
    const store = readFileSync(join(__dirname, '..', 'threadFiles.service.ts'), 'utf8');
    expect(store).toContain('original?.bytes ?? null');
  });
});
