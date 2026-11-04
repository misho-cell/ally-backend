import { ASKER_AS_THE_READER_SAVED_THEM, CHANNEL_WORD_SQL_RE } from '../savedNameSql';

/**
 * #8749 (Tornike, 4 Nov): Lika's chats named him „tornike abuladze Whatsapp".
 * A label carrying the app it was saved for is passed over like an import note.
 */
describe('a phonebook label naming the app', () => {
  const re = new RegExp(CHANNEL_WORD_SQL_RE, 'iu');

  it('is recognised in either script', () => {
    for (const label of [
      'tornike abuladze Whatsapp',
      'Nino WhatsApp',
      'ლიკა ვოთსაპი',
      'Gio viber',
    ]) {
      expect(re.test(label)).toBe(true);
    }
  });

  it('leaves a plain name alone', () => {
    for (const label of ['Tornike Abuladze', 'ლიკა ოსეფაშვილი', 'Telavi Nino']) {
      expect(re.test(label)).toBe(false);
    }
  });

  it('is excluded from the clean label the reader sees', () => {
    expect(ASKER_AS_THE_READER_SAVED_THEM).toContain(`!~* '${CHANNEL_WORD_SQL_RE}'`);
  });
});
