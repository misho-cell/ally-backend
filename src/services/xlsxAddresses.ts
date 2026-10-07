import JSZip from 'jszip';

/**
 * The tester's note of 6 Oct (box 43066): a valid small .xlsx, written by a
 * minimal writer, was refused as „damaged or password protected". The format
 * lets a writer leave out the address of a row (`<row r="2">`) and of a cell
 * (`<c r="B2">`): each then follows the one before it. ExcelJS needs the
 * addresses and throws „Invalid row number in model" without them.
 *
 * This fills in every missing address, counting the way the format does, so
 * the same workbook can be read. Addresses that are present are kept as they
 * are, and nothing else in the file is touched.
 */
const WORKSHEET_PATH_RE = /^xl\/worksheets\/[^/]+\.xml$/u;
const ROW_OR_CELL_TAG_RE = /<(row|c)\b([^>]*?)(\/?)>/gu;
const ROW_ADDRESS_RE = /\sr="(\d+)"/u;
const CELL_ADDRESS_RE = /\sr="([A-Z]+)\d+"/u;
const LETTERS_IN_ALPHABET = 26;
const CHAR_CODE_BEFORE_A = 'A'.charCodeAt(0) - 1;

/** A column number (1 = A) as its letters. */
export function columnLetters(column: number): string {
  let letters = '';
  for (let n = column; n > 0; n = Math.floor((n - 1) / LETTERS_IN_ALPHABET)) {
    letters =
      String.fromCharCode(CHAR_CODE_BEFORE_A + ((n - 1) % LETTERS_IN_ALPHABET) + 1) + letters;
  }
  return letters;
}

/** Column letters (A = 1) as their number. */
export function columnNumber(letters: string): number {
  return [...letters].reduce(
    (sum, letter) => sum * LETTERS_IN_ALPHABET + (letter.charCodeAt(0) - CHAR_CODE_BEFORE_A),
    0,
  );
}

/** One worksheet's XML with an address on every row and cell. */
export function addressSheetXml(xml: string): string {
  let row = 0;
  let column = 0;
  return xml.replace(ROW_OR_CELL_TAG_RE, (tag, name: string, attributes: string, close: string) => {
    if (name === 'row') {
      const given = ROW_ADDRESS_RE.exec(attributes);
      row = given === null ? row + 1 : Number(given[1]);
      column = 0;
      return given === null ? `<row r="${row}"${attributes}${close}>` : tag;
    }
    const given = CELL_ADDRESS_RE.exec(attributes);
    column = given === null ? column + 1 : columnNumber(given[1]);
    return given === null ? `<c r="${columnLetters(column)}${row}"${attributes}${close}>` : tag;
  });
}

/** The workbook with every worksheet addressed; a non-zip input throws. */
export async function withCellAddresses(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const sheets = Object.keys(zip.files).filter((path) => WORKSHEET_PATH_RE.test(path));
  for (const path of sheets) {
    const file = zip.file(path);
    if (file !== null) zip.file(path, addressSheetXml(await file.async('string')));
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}
