import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('../../db/postgres/client', () => ({ query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { answersTheRequestOnly } from '../requestReferral';

const mockQuery = query as jest.MockedFunction<typeof query>;

/** The tester's 68815, round 7: the mediator's two spellings of the same line. */
const POINTED_ELSEWHERE = [
  'სანდროს კარგად არ ვიცნობ, დავითს ჰკითხეთ, ის მისი ბიზნეს პარტნიორია.',
  'სანდროს კარგად არ ვიცნობ, დავითი-ს ჰკითხე, ის მისი ბიზნეს პარტნიორია.',
];
const REQUEST_ID = 41;

function pending(isPending: boolean): void {
  mockQuery.mockResolvedValueOnce({ rows: [{ pending: isPending }] } as never);
}

describe('#5249: a mediator who points the owner elsewhere answers the request', () => {
  beforeEach(() => mockQuery.mockReset());

  it.each(POINTED_ELSEWHERE)('holds only the answer on a pending request: %s', async (line) => {
    pending(true);
    await expect(answersTheRequestOnly('incoming_request', REQUEST_ID, line)).resolves.toBe(true);
    expect(mockQuery.mock.calls[0][1]).toEqual([REQUEST_ID]);
  });

  it('leaves a request already answered alone', async () => {
    pending(false);
    await expect(
      answersTheRequestOnly('incoming_request', REQUEST_ID, POINTED_ELSEWHERE[0]),
    ).resolves.toBe(false);
  });

  it('leaves a plain yes or no to the run, without reading the request', async () => {
    await expect(
      answersTheRequestOnly('incoming_request', REQUEST_ID, 'კი, დაგაკავშირებ'),
    ).resolves.toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('is only the incoming introduction request', async () => {
    await expect(answersTheRequestOnly('regular', REQUEST_ID, POINTED_ELSEWHERE[0])).resolves.toBe(
      false,
    );
    await expect(
      answersTheRequestOnly('incoming_request', null, POINTED_ELSEWHERE[0]),
    ).resolves.toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('fails towards the ordinary run when the request cannot be read', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    await expect(
      answersTheRequestOnly('incoming_request', REQUEST_ID, POINTED_ELSEWHERE[0]),
    ).resolves.toBe(false);
    warn.mockRestore();
  });

  it('is wired: that run is offered respond_to_introduction alone', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'await answersTheRequestOnly(thread.type, thread.introduction_request_id, userMessage)',
    );
    expect(chat).toContain(
      '? tools.filter((tool) => tool.name === RESPOND_TO_INTRODUCTION_TOOL.name)',
    );
  });
});
