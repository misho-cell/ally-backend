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

describe('own-number allow spans', () => {
  const { scrubEmailsDeep, stripAllowedSpans, ALLOW_OPEN, ALLOW_CLOSE } =
    jest.requireActual<typeof import('../../privacyScrub')>('../../privacyScrub');

  it('scrubText preserves an allowed span (markers intact) but scrubs numbers outside it', () => {
    const text = `own: ${ALLOW_OPEN}+995599123456${ALLOW_CLOSE}, other: +995577000000`;
    const scrubbed = scrubText(text);
    expect(scrubbed).toContain(`${ALLOW_OPEN}+995599123456${ALLOW_CLOSE}`);
    expect(scrubbed).toContain('[hidden]');
    expect(scrubbed).not.toContain('+995577000000');
  });

  it('is idempotent across repeated scrub passes, then reveals at the boundary', () => {
    const once = scrubText(`${ALLOW_OPEN}+995599123456${ALLOW_CLOSE}`);
    const twice = scrubText(once);
    expect(twice).toBe(once);
    expect(stripAllowedSpans(twice)).toBe('+995599123456');
  });

  it('a number the model wraps WITHOUT the backend marker still gets scrubbed', () => {
    expect(scrubText('call +995599123456')).toBe('call [hidden]');
  });

  it('scrubEmailsDeep masks saved emails but leaves other text intact', () => {
    const out = scrubEmailsDeep({
      facts: [{ value: 'email: g.kuprashvili@gt.ge, office Tbilisi' }],
    }) as { facts: Array<{ value: string }> };
    expect(out.facts[0].value).toBe('email: [email hidden], office Tbilisi');
  });
});

describe('over-masking guards', () => {
  it('keeps year ranges and short counts, masks real phones', () => {
    expect(scrubText('MBA — FreeUni/ESM, 2015-2017')).toContain('2015-2017');
    expect(scrubText('2 698 ადამიანი გყავს')).toContain('2 698');
    expect(scrubText('call +995 599 12 34 56')).toContain('[hidden]');
    expect(scrubText('599 12 34 56')).toContain('[hidden]');
  });
});
