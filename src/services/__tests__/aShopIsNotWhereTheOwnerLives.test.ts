jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { toolDescription } from '../chat.service';

/** Prompt chat 65225 item 3 (56836, 56866): „my pharmacy is on Saburtalo" became city. */
describe('the city the owner lives in', () => {
  it('is saved only when they say where they live, never from a shop or office', () => {
    const text = toolDescription('update_user_profile');
    expect(text).toContain('city is where the user LIVES, saved only when they say so');
    expect(text).toContain('never save it as city');
  });
});
