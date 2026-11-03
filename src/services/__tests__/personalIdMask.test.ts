import { readFileSync } from 'fs';
import { join } from 'path';
import { maskPersonalIds, PERSONAL_ID_MASK } from '../personalIdMask';

describe('maskPersonalIds (#8618)', () => {
  it('hides a standalone 11-digit personal ID', () => {
    expect(maskPersonalIds('ჩემი პირადი ნომერია 01001012345.')).toBe(
      `ჩემი პირადი ნომერია ${PERSONAL_ID_MASK}.`,
    );
  });

  it('hides every ID in a pasted list', () => {
    const pasted = 'ანა, 61001012345\nგიორგი 12001054321';
    expect(maskPersonalIds(pasted)).toBe(`ანა, ${PERSONAL_ID_MASK}\nგიორგი ${PERSONAL_ID_MASK}`);
  });

  it('leaves a phone written with a plus alone', () => {
    expect(maskPersonalIds('დამირეკე +79001234567')).toBe('დამირეკე +79001234567');
  });

  it('leaves Georgian phones alone, with or without the country code', () => {
    expect(maskPersonalIds('555123456 ან 995555123456')).toBe('555123456 ან 995555123456');
  });

  it('leaves longer and shorter numbers alone', () => {
    expect(maskPersonalIds('1234567890 და 123456789012')).toBe('1234567890 და 123456789012');
  });

  it('leaves digits inside a word, an address or a code alone', () => {
    const text = 'ORD01001012345 https://x.ge/p/01001012345 a.01001012345';
    expect(maskPersonalIds(text)).toBe(text);
  });

  it('returns text without IDs unchanged', () => {
    expect(maskPersonalIds('ვინ იცნობს TBC-ში ვინმეს?')).toBe('ვინ იცნობს TBC-ში ვინმეს?');
  });
});

describe('the model reads the masked owner line (#8618)', () => {
  it('masks the line at the start of every run', () => {
    const source = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const runStart = source.indexOf('export async function processChat(');
    const firstUse = source.indexOf('userMessage', runStart);
    expect(
      source.slice(runStart, firstUse + 'userMessage = maskPersonalIds(ownerLine);'.length),
    ).toContain('const userMessage = maskPersonalIds(ownerLine);');
  });
});
