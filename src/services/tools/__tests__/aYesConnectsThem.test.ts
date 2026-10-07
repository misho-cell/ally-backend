/**
 * D709 (the founder, 7 Oct): „Yes, connect them" connects them. The tool no
 * longer refuses a yes to ask the mediator how; the resolver decides.
 */
jest.mock('../../introduction.service', () => ({
  __esModule: true,
  resolveIntroductionRequest: jest.fn(),
}));

import { resolveIntroductionRequest } from '../../introduction.service';
import { respondToIntroduction } from '../respondToIntroduction';

const mockResolve = resolveIntroductionRequest as jest.MockedFunction<
  typeof resolveIntroductionRequest
>;

beforeEach(() => {
  mockResolve.mockReset();
  mockResolve.mockResolvedValue({ ok: true } as never);
});

describe('respond_to_introduction', () => {
  it('records a yes at once, with no channel asked', async () => {
    const out = (await respondToIntroduction('7', 12, true)) as Record<string, unknown>;
    expect(out).toEqual({ success: true });
    expect(mockResolve).toHaveBeenCalledWith('7', { requestId: 12 }, 'accept', {
      response: undefined,
      source: 'chat',
    });
  });

  it('records a no the same way', async () => {
    await respondToIntroduction('7', 12, false, 'not now');
    expect(mockResolve).toHaveBeenCalledWith('7', { requestId: 12 }, 'decline', {
      response: 'not now',
      source: 'chat',
    });
  });

  it('says what went wrong when the request cannot be answered', async () => {
    mockResolve.mockResolvedValue({ ok: false, error: 'gone' } as never);
    expect(await respondToIntroduction('7', 12, true)).toEqual({ success: false, error: 'gone' });
  });
});
