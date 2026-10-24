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
jest.mock('pdfjs-legacy/legacy/build/pdf.js', () => ({
  getDocument: (...args: unknown[]) => ({ promise: mockLegacy(...args) }),
}));

/** A pdf.js document whose pages hold these lines. */
function documentOf(pages: readonly string[]): unknown {
  return {
    numPages: pages.length,
    getPage: (n: number) =>
      Promise.resolve({
        getTextContent: () => Promise.resolve({ items: [{ str: pages[n - 1] }] }),
      }),
    destroy: () => Promise.resolve(),
  };
}

import { pdfText } from '../documentText';

/**
 * #7393 retest (tester 73723, PDF FAIL 2/2): the server runs Node 18 and
 * pdf-parse 2 needs Node 20.16 („DOMMatrix is not defined"). pdf.js 3's
 * legacy build takes over when the current one cannot read.
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

  it('is read by pdf.js 3 when pdf-parse 2 cannot run (Node 18, 20.11)', async () => {
    mockCurrent.mockRejectedValueOnce(new Error('DOMMatrix is not defined'));
    mockLegacy.mockResolvedValueOnce(documentOf(['Acme LLC, 2 vans', 'Total 60000 GEL']));
    await expect(pdfText(Buffer.from('%PDF'))).resolves.toBe('Acme LLC, 2 vans\nTotal 60000 GEL');
    expect(mockLegacy).toHaveBeenCalledWith(expect.objectContaining({ isEvalSupported: false }));
  });

  it('fails the one upload when neither can read it', async () => {
    mockCurrent.mockRejectedValueOnce(new Error('DOMMatrix is not defined'));
    mockLegacy.mockRejectedValueOnce(new Error('bad XRef entry'));
    await expect(pdfText(Buffer.from('%PDF'))).rejects.toThrow('bad XRef entry');
  });
});
