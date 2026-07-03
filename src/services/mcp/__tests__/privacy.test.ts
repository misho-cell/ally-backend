import { containsPhoneLike, scrubDeep, scrubText } from '../privacy';

describe('scrubText', () => {
  it('redacts international and spaced phone numbers', () => {
    expect(scrubText('call me at +995 599 12 34 56 tomorrow')).toBe('call me at [hidden] tomorrow');
    expect(scrubText('nino: 599123456')).toBe('nino: [hidden]');
  });

  it('keeps ISO dates and short numbers', () => {
    expect(scrubText('added on 2026-07-03')).toBe('added on 2026-07-03');
    expect(scrubText('office #1204, floor 3')).toBe('office #1204, floor 3');
  });
});

describe('scrubDeep', () => {
  it('drops phone-named keys and scrubs nested strings', () => {
    const scrubbed = scrubDeep({
      name: 'Gio',
      phone: '+995599123456',
      target_phone: '+995599000000',
      notes: { text: 'his number is 599 12 34 56', city: 'Tbilisi' },
      tags: ['ceo', 'reach at +995577112233'],
    }) as Record<string, unknown>;

    expect(scrubbed.phone).toBeUndefined();
    expect(scrubbed.target_phone).toBeUndefined();
    expect(scrubbed.name).toBe('Gio');
    expect((scrubbed.notes as Record<string, unknown>).text).toBe('his number is [hidden]');
    expect(scrubbed.tags).toEqual(['ceo', 'reach at [hidden]']);
    expect(containsPhoneLike(scrubbed)).toBe(false);
  });

  it('serializes Date values instead of destroying them', () => {
    const scrubbed = scrubDeep({ created_at: new Date('2026-07-03T10:00:00Z') }) as Record<
      string,
      unknown
    >;
    expect(scrubbed.created_at).toBe('2026-07-03T10:00:00.000Z');
  });
});

describe('containsPhoneLike', () => {
  it('flags surviving phones and passes clean payloads', () => {
    expect(containsPhoneLike({ a: 'call +995599123456' })).toBe(true);
    expect(containsPhoneLike({ a: 'meeting on 2026-07-03', n: 42 })).toBe(false);
  });
});
