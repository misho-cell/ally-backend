jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { withHandedOverNumbersAllowed } from '../chat.service';
import { ALLOW_CLOSE, ALLOW_OPEN } from '../privacyScrub';

/** #6360 (the prompt chat's box 70133): „…ნომერია:" and nothing after it. */
describe('a number the go-between handed over', () => {
  it('reaches the model as the owner’s to show', () => {
    const [row] = withHandedOverNumbersAllowed([
      { request_id: 1, contact_handed_over: true, target_phone: '+995500000001' },
    ]);
    expect(row.target_phone).toBe(`${ALLOW_OPEN}+995500000001${ALLOW_CLOSE}`);
  });

  it('stays as it was when nothing was handed over', () => {
    const rows = [
      { request_id: 2, contact_handed_over: false, target_phone: '+995500000002' },
      { request_id: 3, contact_handed_over: null, target_phone: null },
    ];
    expect(withHandedOverNumbersAllowed(rows)).toEqual(rows);
  });
});
