import { readFileSync } from 'fs';
import { join } from 'path';
import { westernDigits } from '../westernDigits';

/** 3106 (ST-009): no reply carries digits outside 0–9. */
describe('westernDigits', () => {
  it('turns Extended Arabic-Indic (Persian) digits into 0–9', () => {
    expect(westernDigits('ტენიანობა ۵۴-۸۸%')).toBe('ტენიანობა 54-88%');
  });

  it('turns Arabic-Indic digits into 0–9', () => {
    expect(westernDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
  });

  it('leaves every other character alone', () => {
    const text = 'Tbilisi 21°C, ქარი 1-2 მ/წმ.';
    expect(westernDigits(text)).toBe(text);
  });

  it('runs first in the final scrub, so the phone scrub reads 0–9', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('withoutLeadingSelfNote(westernDigits(text), runLang(runId))');
  });
});
