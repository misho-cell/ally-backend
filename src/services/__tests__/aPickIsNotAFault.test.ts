import { readFileSync } from 'fs';
import { join } from 'path';

import { scrubDeep } from '../privacyScrub';
import { phoneHint } from '../tools/requestIntroduction';
import { languageOfConversation } from '../runLanguage';

/**
 * Lika's re-test (12 Nov, alert 265). „Ask him first, then the other" found
 * three contacts of one name and asked the owner which; the server read the run
 * as an instruction left unsent and forced „it could not be sent, our fault".
 * The owner's pick then came back „<name> (undefined)", its reply was added to
 * the waiting request, and the same rewrite fired again — in English.
 */
describe('a run that asks the owner which person they mean', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('is not an instruction left unsent, and neither is a run that sent an introduction', () => {
    const at = chat.indexOf('const instructionUnsent =');
    const block = chat.slice(at, at + 2000);
    expect(block).toContain('!runIntroSent.has(runId) &&');
    expect(block).toContain('options === undefined &&');
  });
});

describe('the pick buttons on the screen', () => {
  it('carry a hint that tells same-named people apart, never the number', () => {
    expect(phoneHint('+995 599 12 41 75')).toBe('…4175');
    expect(phoneHint('12')).toBe('');
    const onScreen = scrubDeep([{ phone: '+995599124175', name: 'ნიკა', hint: '…4175' }]);
    expect(onScreen).toEqual([{ name: 'ნიკა', hint: '…4175' }]);
  });
});

describe('the language of a conversation', () => {
  it('is not read from a picked name', () => {
    expect(
      languageOfConversation('nikoloz abashidze-kvirikashvili (…4175)', [
        'გიორგისთან მინდა საუბარი, ჯერ ნიკას ჰკითხე',
      ]),
    ).toBe('ka');
  });

  it('still reads a real English sentence', () => {
    expect(languageOfConversation('please ask him about the training first', [])).toBe('en');
  });
});
