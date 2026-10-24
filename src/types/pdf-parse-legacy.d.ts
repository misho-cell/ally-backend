/** pdf-parse 1.1.1 under an alias (#7393): only the entry point and the fields read. */
declare module 'pdf-parse-legacy/lib/pdf-parse.js' {
  interface LegacyPdfResult {
    readonly text: string;
    readonly numpages: number;
  }
  function readPdf(data: Buffer, options?: { readonly max?: number }): Promise<LegacyPdfResult>;
  export default readPdf;
}
