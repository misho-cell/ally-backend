jest.mock('../../db/postgres/client', () => ({
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  __esModule: true,
  query: jest.fn(),
  default: {},
}));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { buildReplyLanguageDirective } from '../chat.service';

/**
 * The strongest language instruction in the prompt was computed by the weakest
 * rule in the file, and could not say „Spanish".
 *
 * Found on 18 September while checking the seat's reading that something other
 * than the engine events is still tipping first-turn English runs.
 *
 * It took the RAW latest message and re-detected its script, while the run had
 * already worked `language` out properly with languageOfConversation — the rule
 * that knows an engine event is not the owner speaking, and that a two-letter
 * „ok" does not turn a Georgian conversation English. So the block marked
 * [HARD RULE] disagreed with every other fixed string whenever the two
 * differed, and on an engine run they differed by construction.
 *
 * And REPLY_LANGUAGE had three members for a product that speaks four, so a
 * Spanish conversation was told it was English.
 */
describe('the reply-language directive', () => {
  it('names all four languages the product speaks', () => {
    expect(buildReplyLanguageDirective('ka')).toContain('Georgian');
    expect(buildReplyLanguageDirective('en')).toContain('English');
    expect(buildReplyLanguageDirective('ru')).toContain('Russian');
    expect(buildReplyLanguageDirective('es')).toContain('Spanish');
  });

  it('never calls a Spanish conversation English, which it used to', () => {
    expect(buildReplyLanguageDirective('es')).not.toContain('English');
  });

  it('takes the run’s decided language, not a script guess at a message', () => {
    // The signature is the point: it cannot re-detect anything, because it is
    // given the answer the rest of the run is already using.
    expect(buildReplyLanguageDirective.length).toBe(1);
    expect(buildReplyLanguageDirective('en')).toContain('decided from the OWNER');
  });

  it('tells the model that Georgian in a search result is data, not a cue', () => {
    // The seat's live case 17590: an English goal leaked with no event in the
    // thread at all, in the message reporting what was found in the owner's
    // contacts — which on this base is a wall of Georgian names and labels. It
    // cannot be translated away, so it is named for what it is.
    const directive = buildReplyLanguageDirective('en');
    expect(directive).toContain('data, not a cue');
    expect(directive).toMatch(/phonebook/i);
  });

  it('still says every part of the reply, buttons included', () => {
    // Thread 17560: 660 Latin characters of English answer above two Georgian
    // buttons the same model wrote in the same call.
    expect(buildReplyLanguageDirective('en')).toContain('button label');
  });

  it('keeps the transliteration clause, which is why it cannot just match script', () => {
    expect(buildReplyLanguageDirective('ka')).toMatch(/transliterated Georgian/i);
  });
});
