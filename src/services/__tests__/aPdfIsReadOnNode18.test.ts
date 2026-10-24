const mockCurrent = jest.fn();
const mockLegacy = jest.fn();
jest.mock('pdf-parse', () => ({
  PDFParse: class {
    getText(): Promise<{ text: string }> {
      return mockCurrent();
    }
    destroy(): Promise<void> {
      return Promise.resolve();
    }
  },
}));
jest.mock('pdf-parse-legacy/lib/pdf-parse.js', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockLegacy(...args),
}));

import { pdfText } from '../documentText';

/**
 * #7393 retest (tester 73723, PDF FAIL 2/2): the server runs Node 18 and
 * pdf-parse 2 needs Node 20.16 („DOMMatrix is not defined"). The old reader
 * takes over when the current one cannot read.
 */
beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('a PDF on either runtime', () => {
  it('is read by pdf-parse 2 when it can', async () => {
    mockCurrent.mockResolvedValueOnce({ text: ' Acme LLC, 2 vans \n' });
    await expect(pdfText(Buffer.from('%PDF'))).resolves.toBe('Acme LLC, 2 vans');
    expect(mockLegacy).not.toHaveBeenCalled();
  });

  it('is read by pdf-parse 1 when pdf-parse 2 cannot run (Node 18)', async () => {
    mockCurrent.mockRejectedValueOnce(new Error('DOMMatrix is not defined'));
    mockLegacy.mockResolvedValueOnce({ text: 'Acme LLC, 2 vans\n', numpages: 1 });
    await expect(pdfText(Buffer.from('%PDF'))).resolves.toBe('Acme LLC, 2 vans');
    expect(mockLegacy).toHaveBeenCalledWith(expect.any(Buffer), { max: 100 });
  });

  it('fails the one upload when neither can read it', async () => {
    mockCurrent.mockRejectedValueOnce(new Error('DOMMatrix is not defined'));
    mockLegacy.mockRejectedValueOnce(new Error('bad XRef entry'));
    await expect(pdfText(Buffer.from('%PDF'))).rejects.toThrow('bad XRef entry');
  });
});
