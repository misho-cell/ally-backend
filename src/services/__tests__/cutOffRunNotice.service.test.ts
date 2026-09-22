jest.mock('../threads.service', () => ({
  __esModule: true,
  saveThreadMessage: jest.fn().mockResolvedValue(undefined),
  threadLanguage: jest.fn().mockResolvedValue('ka'),
}));
jest.mock('../sse.service', () => ({ __esModule: true, emitRunError: jest.fn() }));

import { CutOffRun } from '../inFlightRuns';
import { RUN_STRINGS } from '../runLanguage';
import { emitRunError } from '../sse.service';
import { saveThreadMessage, threadLanguage } from '../threads.service';
import { tellOwnersTheirRunWasCutOff } from '../cutOffRunNotice.service';

const mockSave = saveThreadMessage as jest.MockedFunction<typeof saveThreadMessage>;
const mockEmit = emitRunError as jest.MockedFunction<typeof emitRunError>;
const mockLanguage = threadLanguage as jest.MockedFunction<typeof threadLanguage>;

const CHAT: CutOffRun = { runId: 'r1', kind: 'chat', userId: 171871, threadId: 21121 };
const ENGINE: CutOffRun = { runId: 'r2', kind: 'engine', userId: 160584, threadId: 16737 };

beforeEach(() => {
  jest.clearAllMocks();
  mockLanguage.mockResolvedValue('ka');
  mockSave.mockResolvedValue(undefined as never);
});

/**
 * Ticket 20, the deploy row — 21 September, thread 21121.
 *
 * The owner typed at 23:20:55, my deploy's SIGTERM landed at 23:20:56, the
 * platform killed the container at 23:21:07, and at 23:22:14 the reaper wrote
 * them „something went wrong on our side, please try again". Seventy-eight
 * seconds of spinner, and then the sentence for a fault, for something that
 * was not a fault but my deploy.
 */
describe('telling the owner who cut their run off', () => {
  it('writes the restart sentence into the thread, as an error row', async () => {
    await tellOwnersTheirRunWasCutOff([CHAT]);

    expect(mockSave).toHaveBeenCalledWith(
      21121,
      171871,
      'assistant',
      RUN_STRINGS.ka.restartedMidRun,
      // 'error' renders as a system failure with a retry, never as words the
      // assistant said — this is not the assistant talking, it is the server.
      'error',
      'r1',
    );
  });

  it('says it in the conversation’s own language, not ours', async () => {
    mockLanguage.mockResolvedValue('en');

    await tellOwnersTheirRunWasCutOff([CHAT]);

    expect(mockSave.mock.calls[0][3]).toBe(RUN_STRINGS.en.restartedMidRun);
  });

  it('falls back to Georgian when the language cannot be read', async () => {
    mockLanguage.mockRejectedValue(new Error('gone'));

    await tellOwnersTheirRunWasCutOff([CHAT]);

    expect(mockSave.mock.calls[0][3]).toBe(RUN_STRINGS.ka.restartedMidRun);
  });

  /**
   * Row 214: `run_error` is what ENDS the run for an open page. Without it the
   * error sits in the thread and the screen keeps its spinner until a reload —
   * which is most of what the owner on 21121 actually experienced.
   */
  it('also ends the run on any screen still watching', async () => {
    await tellOwnersTheirRunWasCutOff([CHAT]);

    expect(mockEmit).toHaveBeenCalledWith('171871', 21121, 'r1', RUN_STRINGS.ka.restartedMidRun);
  });

  /**
   * Row 33's rule, in the third place it has come up: the sentence is a claim
   * about a REPLY — „yours was cut off". A wake is work nobody asked for, so
   * there is no reply of theirs to have failed, and saying so would invent a
   * question the owner never put.
   */
  it('says nothing to the owner of an engine wake', async () => {
    const told = await tellOwnersTheirRunWasCutOff([ENGINE]);

    expect(told).toBe(0);
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('tells the chat owners in a mixed list and leaves the wake alone', async () => {
    const told = await tellOwnersTheirRunWasCutOff([ENGINE, CHAT]);

    expect(told).toBe(1);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave.mock.calls[0][0]).toBe(21121);
  });

  /**
   * This is the last thing a dying process does. A throw here would cost it
   * the clean exit, and a slow database would cost it the SIGKILL it is
   * racing — and in both cases the reaper still catches the thread 75 seconds
   * later, so the fallback is real and the failure is only ever a delay.
   */
  it('never throws when the write fails, and says how many were left', async () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockSave.mockRejectedValue(new Error('statement timeout'));

    await expect(tellOwnersTheirRunWasCutOff([CHAT])).resolves.toBe(0);

    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });

  it('gives up on a database that never answers rather than waiting for the kill', async () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockSave.mockImplementation(() => new Promise(() => undefined));

    const started = Date.now();
    const told = await tellOwnersTheirRunWasCutOff([CHAT], 100);

    expect(told).toBe(0);
    expect(Date.now() - started).toBeLessThan(2_000);
    quiet.mockRestore();
  });

  it('does not touch the database at all when nothing was cut off', async () => {
    const told = await tellOwnersTheirRunWasCutOff([]);

    expect(told).toBe(0);
    expect(mockLanguage).not.toHaveBeenCalled();
  });
});
