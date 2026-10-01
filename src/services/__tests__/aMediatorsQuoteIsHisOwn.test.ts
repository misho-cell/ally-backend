/**
 * The tester's 992 (F1): the asker read a quoted sentence the mediator never
 * typed. Only words the mediator actually wrote in the thread travel as a
 * quotation.
 */
jest.mock('../taskAsks.service', () => ({ __esModule: true, answerIsTheirOwnWords: jest.fn() }));

import { answerIsTheirOwnWords } from '../taskAsks.service';
import { mediatorsOwnWords } from '../introResponse';

const mockOwn = answerIsTheirOwnWords as jest.MockedFunction<typeof answerIsTheirOwnWords>;

beforeEach(() => mockOwn.mockReset());

describe('mediatorsOwnWords', () => {
  it('keeps what he typed', async () => {
    mockOwn.mockResolvedValueOnce(true);

    expect(await mediatorsOwnWords(29582, 'კი, გავაცნობ.')).toBe('კი, გავაცნობ.');
    expect(mockOwn).toHaveBeenCalledWith(29582, 'კი, გავაცნობ.');
  });

  it('drops a sentence his assistant wrote', async () => {
    mockOwn.mockResolvedValueOnce(false);

    expect(await mediatorsOwnWords(29582, 'კი, პირდაპირ დაგაკავშირებთ.')).toBeUndefined();
  });

  it('sends nothing to check when there is no response', async () => {
    expect(await mediatorsOwnWords(29582, undefined)).toBeUndefined();
    expect(await mediatorsOwnWords(29582, '  ')).toBeUndefined();
    expect(mockOwn).not.toHaveBeenCalled();
  });

  it('checks against no thread when the run has none', async () => {
    mockOwn.mockResolvedValueOnce(false);

    await mediatorsOwnWords(undefined, 'კი');

    expect(mockOwn).toHaveBeenCalledWith(null, 'კი');
  });
});
