jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { toolDescription, withNamelessLabelsSaid } from '../chat.service';

/** Row 283: a contact saved only as „💙" was shown as a person named „💙". */
describe('a label with no letter in it is said as a label, not a name', () => {
  it('turns an emoji-only name into saved_as', () => {
    const out = withNamelessLabelsSaid('search_by_tag', {
      found: true,
      results: [{ name: '💙', phone: 'x' }, { name: 'Nino Beridze' }],
    }) as { results: Record<string, unknown>[] };
    expect(out.results[0]).toEqual({ name: null, saved_as: '💙', phone: 'x' });
    expect(out.results[1]).toEqual({ name: 'Nino Beridze' });
  });

  it('leaves any name with a letter alone, in any script', () => {
    const out = withNamelessLabelsSaid('search_contact_by_name', {
      results: [{ name: 'ნინო 💙' }, { name: 'Тамара' }],
    }) as { results: Record<string, unknown>[] };
    expect(out.results.map((r) => r.name)).toEqual(['ნინო 💙', 'Тамара']);
  });

  it('touches only search results', () => {
    const raw = { results: [{ name: '💙' }] };
    expect(withNamelessLabelsSaid('get_my_tasks', raw)).toBe(raw);
    expect(withNamelessLabelsSaid('search_by_tag', { found: false })).toEqual({ found: false });
  });

  it('tells the model how to say it', () => {
    expect(toolDescription('search_by_tag')).toMatch(/your contact saved as/);
  });
});
