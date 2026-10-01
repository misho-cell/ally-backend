/**
 * Plate v301 G6, second half: the mediator was offered „connect them
 * directly" for somebody not in his phone, and the asker then heard „the
 * contact has not come through". „Directly" is offered only when there is a
 * number to hand over.
 */
jest.mock('../../introduction.service', () => ({
  __esModule: true,
  mediatorCanHandOver: jest.fn(),
  resolveIntroductionRequest: jest.fn(),
}));
jest.mock('../../threads.service', () => ({
  __esModule: true,
  userLanguage: jest.fn().mockResolvedValue('en'),
}));

import { mediatorCanHandOver, resolveIntroductionRequest } from '../../introduction.service';
import { respondToIntroduction } from '../respondToIntroduction';

const mockCan = mediatorCanHandOver as jest.MockedFunction<typeof mediatorCanHandOver>;
const mockResolve = resolveIntroductionRequest as jest.MockedFunction<
  typeof resolveIntroductionRequest
>;

beforeEach(() => {
  mockCan.mockReset();
  mockResolve.mockReset();
  mockResolve.mockResolvedValue({ ok: true } as never);
});

describe('respond_to_introduction without a number to hand over', () => {
  it('offers only „through me" and „no", and records nothing', async () => {
    mockCan.mockResolvedValueOnce(false);

    const out = (await respondToIntroduction('551', 7, true)) as Record<string, unknown>;

    expect(out).toMatchObject({ success: false, needs_channel: true, direct_unavailable: true });
    expect(String(out.error)).toContain('`direct` is NOT possible');
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('refuses a `direct` tap too', async () => {
    mockCan.mockResolvedValueOnce(false);

    const out = (await respondToIntroduction('551', 7, true, undefined, 'direct')) as Record<
      string,
      unknown
    >;

    expect(out.direct_unavailable).toBe(true);
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('lets „through me" go without asking', async () => {
    const out = (await respondToIntroduction('551', 7, true, undefined, 'via_mediator')) as Record<
      string,
      unknown
    >;

    expect(out.success).toBe(true);
    expect(mockCan).not.toHaveBeenCalled();
  });

  it('keeps the three-way choice when the number is there', async () => {
    mockCan.mockResolvedValueOnce(true);

    const out = (await respondToIntroduction('551', 7, true)) as Record<string, unknown>;

    expect(out.needs_channel).toBe(true);
    expect(out.direct_unavailable).toBeUndefined();
  });

  it('falls back to the old path when the check cannot be read', async () => {
    mockCan.mockRejectedValueOnce(new Error('timeout'));

    const out = (await respondToIntroduction('551', 7, true, undefined, 'direct')) as Record<
      string,
      unknown
    >;

    expect(out.success).toBe(true);
  });

  it('never asks on a decline', async () => {
    await respondToIntroduction('551', 7, false);

    expect(mockCan).not.toHaveBeenCalled();
  });
});
