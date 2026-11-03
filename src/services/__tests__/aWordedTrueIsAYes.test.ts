jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { grantPermissionRefusal, isConfirmed } from '../chat.service';

/** Ops' daily check (3 Nov 18:35Z): confirmed sent as the word "true" was read as no. */
describe('confirmed as the word "true" (daily check, 3 Nov)', () => {
  it.each([
    [true, true],
    ['true', true],
    [' TRUE ', true],
    [false, false],
    ['false', false],
    [undefined, false],
    ['yes', false],
  ])('reads %p as %p', (value, expected) => {
    expect(isConfirmed(value)).toBe(expected);
  });

  it('no longer refuses grant_task_permission as unconfirmed when the word is "true"', () => {
    expect(grantPermissionRefusal('true', null)).toBeNull();
    expect(grantPermissionRefusal(undefined, null)?.reason).toBe('not_confirmed');
  });
});
