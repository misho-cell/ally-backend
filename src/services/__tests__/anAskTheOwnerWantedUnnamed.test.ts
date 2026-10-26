import { readFileSync } from 'fs';
import { join } from 'path';
import { anonymousPushTitle, withoutAskerNames } from '../anonymousAsk';
import { buildAskOpening } from '../askOpening';
import { ASKER_AS_THE_READER_SAVED_THEM } from '../savedNameSql';

const source = (file: string): string => readFileSync(join(__dirname, '..', file), 'utf8');

/** #7856, replay R3: „write to the other assistants that one guy is looking for a masseur". */
describe('an ask the owner wanted unnamed', () => {
  it('opens without a name, in each language, on first contact and after', () => {
    const ka = buildAskOpening('ka', 'გიორგი განიძე', null, 'იცნობ კარგ მასაჟისტს?', 'first', true);
    expect(ka).not.toContain('გიორგი');
    expect(ka).toContain('Netai-ის ერთ-ერთი წევრის ასისტენტი');
    for (const language of ['en', 'ru', 'es'] as const) {
      for (const shape of ['first', 'followUp', 'added'] as const) {
        const line = buildAskOpening(
          language,
          'Giorgi Gagnidze',
          'CELA',
          'A masseur?',
          shape,
          true,
        );
        expect(line).not.toMatch(/Giorgi|Gagnidze|CELA/u);
      }
    }
  });

  it('still names the asker when the owner did not ask otherwise', () => {
    expect(buildAskOpening('en', 'Giorgi', null, 'A masseur?', 'first')).toContain('Giorgi');
  });

  it('takes the owner’s name out of the question, Georgian case endings too', () => {
    expect(
      withoutAskerNames(
        'გიორგის სჭირდება მასაჟისტი, გიორგი გაგნიძე გთხოვს',
        ['გიორგი გაგნიძე'],
        'ka',
      ),
    ).toBe('ერთ-ერთი წევრი სჭირდება მასაჟისტი, ერთ-ერთი წევრი გთხოვს');
    expect(withoutAskerNames('Giorgi Gagnidze needs a masseur', ['Giorgi Gagnidze'], 'en')).toBe(
      'a Netai member needs a masseur',
    );
  });

  it('leaves a word that only contains the name alone', () => {
    expect(withoutAskerNames('Ana went to Anaklia', ['Ana'], 'en')).toBe(
      'a Netai member went to Anaklia',
    );
  });

  it('rings without a name', () => {
    expect(anonymousPushTitle('ka')).not.toMatch(/\{|\}/u);
    expect(anonymousPushTitle('en')).toContain("member's assistant");
  });

  it('names nobody on the reader’s own lines either', () => {
    expect(ASKER_AS_THE_READER_SAVED_THEM).toMatch(/^CASE WHEN ta\.anonymous THEN/u);
  });

  it('is stored, inherited by a follow-up, and reaches every place a name stood', () => {
    const asks = source('taskAsks.service.ts');
    expect(asks).toContain('const unnamed = anonymous ?? live.rows[0]?.anonymous === true;');
    expect(asks).toContain('prepared_answer,\n                            anonymous)');
    expect(asks).toContain('askerName: shownName');
    expect(asks).toContain('anonymousPushTitle(language)');
    expect(asks).toContain('withoutAskerNames(edited.question, askerNames, language)');
    const chat = source('chat.service.ts');
    expect(chat).toContain(
      "typeof input['anonymous'] === 'boolean' ? input['anonymous'] : undefined",
    );
  });
});
