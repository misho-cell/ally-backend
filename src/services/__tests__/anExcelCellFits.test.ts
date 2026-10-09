jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { EXCEL_CELL_MAX_CHARS, fitsACell } from '../listItems.service';

/** 2347: a cell over Excel's limit makes the whole file „damaged" on open. */
describe('an Excel cell', () => {
  it('is cut to Excel’s limit, and only when over it', () => {
    expect(fitsACell('x'.repeat(EXCEL_CELL_MAX_CHARS + 10))).toHaveLength(EXCEL_CELL_MAX_CHARS);
    expect(fitsACell('ნინო')).toBe('ნინო');
    expect(EXCEL_CELL_MAX_CHARS).toBe(32_767);
  });
});
