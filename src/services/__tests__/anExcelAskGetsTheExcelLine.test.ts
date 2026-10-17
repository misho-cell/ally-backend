import { readFileSync } from 'fs';
import { join } from 'path';
import { asksForExcel, EXCEL_LINE, withExcelLine } from '../excelLine';

/** D796 / D800: „I cannot make Excel, paste it into a spreadsheet" (tester 0 of 3). */
describe('a list asked for as Excel', () => {
  const table = '| სახელი | კომპანია |\n|---|---|\n| ნინო | ალფა |\n| გიორგი | ბეტა |';

  it('loses the refusal and gets the line, in Georgian', () => {
    const reply =
      `აი სია:\n\n${table}\n\n` +
      'Excel ფაილს პირდაპირ ვერ შევქმნი. ეს ცხრილი პირდაპირ ჩასვი ექსელში. სხვა რამე გჭირდება?';
    const out = withExcelLine(reply, 'ეს სია ექსელად მომეცი', 'ka');
    expect(out).not.toContain('ვერ შევქმნი');
    expect(out).not.toContain('ჩასვი');
    expect(out).toContain('სხვა რამე გჭირდება?');
    expect(out).toContain(table);
    expect(out.endsWith(EXCEL_LINE.ka!)).toBe(true);
  });

  it('in English, with a numbered list', () => {
    const reply =
      'Here they are:\n1. Nino — Alpha\n2. Giorgi — Beta\n\n' +
      'I cannot create or attach an Excel file directly here. You can paste this into a spreadsheet.';
    const out = withExcelLine(reply, 'give me this as Excel', 'en');
    expect(out).toBe('Here they are:\n1. Nino — Alpha\n2. Giorgi — Beta\n\n' + EXCEL_LINE.en);
  });

  it('is left alone without an Excel ask, without a list, or in a language with no approved line', () => {
    const reply = `${table}\n\nExcel ფაილს ვერ შევქმნი.`;
    expect(withExcelLine(reply, 'ვინ ვიცი ალფაში?', 'ka')).toBe(reply);
    expect(withExcelLine('Excel ფაილს ვერ შევქმნი.', 'ექსელად მომეცი', 'ka')).toBe(
      'Excel ფაილს ვერ შევქმნი.',
    );
    expect(withExcelLine(reply, 'дай в excel', 'ru')).toBe(reply);
  });

  it('is said once', () => {
    const once = withExcelLine(table, 'excel please', 'en');
    expect(withExcelLine(once, 'excel please', 'en')).toBe(once);
  });

  it('knows an Excel ask', () => {
    expect(asksForExcel('შედეგი ექსელის ფაილად მინდა')).toBe(true);
    expect(asksForExcel('as an xlsx')).toBe(true);
    expect(asksForExcel('ვინ არის ბუღალტერი?')).toBe(false);
  });

  it('is applied to the final reply', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'effectiveFinal = withExcelLine(effectiveFinal, userMessage, language);',
    );
  });
});

describe('three names on bare lines (#2347, Lika 17 Oct)', () => {
  it('become a list, lose the refusal and get the line', () => {
    const reply =
      'ნინო  \nგიორგი  \nლიკა  \n\nამ ჩატში ჩამოსატვირთი Excel ფაილის შექმნა ვერ შემიძლია. ' +
      'ზემოთ მოცემული სამი სტრიქონი პირდაპირ ჩასვი Excel-ში.';
    const out = withExcelLine(reply, 'მომიმზადე Excel ფაილი სამი სახელით', 'ka');
    expect(out).toBe(`- ნინო\n- გიორგი\n- ლიკა\n\n${EXCEL_LINE.ka}`);
  });

  it('a reply of sentences is not turned into a list', () => {
    const reply = 'ეს სია ვერ შევადგინე.\nსხვა რამე გჭირდება?';
    expect(withExcelLine(reply, 'excel please', 'ka')).toBe(reply);
  });
});
