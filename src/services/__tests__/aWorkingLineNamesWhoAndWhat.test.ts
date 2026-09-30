import { namedStepCaption } from '../runLanguage';

/**
 * Row 304: the working lines named nobody. The founder's example of the line
 * he wants: „sending the introduction request to Tornike".
 */
describe('a working line names the real action and the person', () => {
  it("names the bridge and the target of an introduction (the founder's example)", () => {
    expect(
      namedStepCaption(
        'request_introduction',
        { mediator_name: 'Tornike', target_name: 'Nino' },
        'en',
      ),
    ).toBe('📨 Asking Tornike to introduce you to Nino…');
    expect(namedStepCaption('request_introduction', { mediator_name: 'Tornike' }, 'en')).toBe(
      '📨 Sending the introduction request to Tornike…',
    );
  });

  it('names what a search is looking for, in the conversation language', () => {
    expect(namedStepCaption('search_by_tag', { tag_query: 'ადვოკატი' }, 'ka')).toBe(
      '🔍 კონტაქტებში ვეძებ: „ადვოკატი"…',
    );
    expect(namedStepCaption('web_search', { query: 'land lawyer Tbilisi' }, 'en')).toBe(
      '🌐 Searching the web for "land lawyer Tbilisi"…',
    );
  });

  it('never shows a phone number the model passed (D149)', () => {
    const line = namedStepCaption('relay_ask', { contact_name: 'Nino +995599123456' }, 'en') ?? '';
    expect(line).not.toMatch(/\d{4,}/);
    expect(line).toContain('Nino');
  });

  it('falls back when the call carries nothing to name', () => {
    expect(namedStepCaption('ask_contact', { phone: '+995599123456' }, 'en')).toBeNull();
    expect(namedStepCaption('search_by_tag', {}, 'en')).toBeNull();
    expect(namedStepCaption('search_by_tag', { tag_query: '   ' }, 'en')).toBeNull();
  });

  it('keeps a long query short', () => {
    const line = namedStepCaption('web_search', { query: 'x'.repeat(200) }, 'en') ?? '';
    expect(line.length).toBeLessThan(80);
  });
});
