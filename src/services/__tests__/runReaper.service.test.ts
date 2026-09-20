jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../threads.service', () => ({
  __esModule: true,
  saveThreadMessage: jest.fn().mockResolvedValue(undefined),
  // The failure line follows the conversation now (18 September, thread 17724:
  // an English thread's run died and left 57 Georgian characters behind). The
  // default here is Georgian so every assertion below still reads the language
  // it was written for.
  threadLanguage: jest.fn().mockResolvedValue('ka'),
  // The seat's 332. The sweep reaps every stale run in ONE statement, so it
  // cannot write the caption there — the caption belongs to each owner's own
  // language. The statement writes NULL and the loop fills it in per thread.
  updateThreadStatus: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../sse.service', () => ({
  __esModule: true,
  emitThreadUpdated: jest.fn(),
  emitRunError: jest.fn(),
}));

import { query } from '../../db/postgres/client';
import { assertPlaceholdersMatchParams } from '../../db/postgres/placeholders';
import { saveThreadMessage, threadLanguage, updateThreadStatus } from '../threads.service';
import { emitRunError, emitThreadUpdated } from '../sse.service';
import { sweepOrphanedRuns } from '../runReaper.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => jest.clearAllMocks());

function reaped(rows: unknown[]): void {
  mockQuery.mockResolvedValue({ rows, rowCount: rows.length } as never);
}

/**
 * Ticket 20 row 3 — the reaper told an owner their reply had failed while the
 * reply sat on the screen above it.
 *
 * Thread 15841, Tornike's volleyball goal, 16 September. Run fe7980fa wrote a
 * complete plan at 15:34:22. At 15:35:42 this sweep wrote „ტექნიკური შეფერხება
 * მოხდა — პასუხი ვერ დასრულდა" underneath it.
 *
 * Something left the thread on 'working' after a run finished, and that cause
 * is NOT established — two runs overlapped on that thread and both status
 * writes are fire-and-forget, which is a candidate rather than a finding.
 * Clearing the stale status is right whatever the cause. The false sentence
 * never is.
 */
describe('row 3 — the reaper does not call a delivered answer a failure', () => {
  it('writes no error when the thread answered, and still clears the status', async () => {
    reaped([
      {
        id: 15841,
        user_id: 501,
        status: 'failed',
        status_line: 'ვერ დასრულდა',
        answered: true,
        was_asked: true,
      },
    ]);

    const n = await sweepOrphanedRuns();

    expect(n).toBe(1);
    // The row was updated — a thread stuck on 'working' is a spinner that
    // never stops, and that is worth clearing on its own.
    expect(emitThreadUpdated).toHaveBeenCalled();
    // But nothing claimed the reply had failed.
    expect(saveThreadMessage).not.toHaveBeenCalled();
  });

  it('still reports a genuinely dead run, which is what the reaper is for', async () => {
    reaped([
      {
        id: 15643,
        user_id: 501,
        status: 'failed',
        status_line: 'ვერ დასრულდა',
        answered: false,
        was_asked: true,
      },
    ]);

    await sweepOrphanedRuns();

    expect(saveThreadMessage).toHaveBeenCalledTimes(1);
    const [, , , text, kind] = (saveThreadMessage as jest.Mock).mock.calls[0];
    expect(String(text)).toContain('ტექნიკური შეფერხება');
    expect(kind).toBe('error');
  });

  it('asks the database the answered question at all', async () => {
    reaped([]);

    await sweepOrphanedRuns();

    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain('AS answered');
    expect(sql).toContain("c.role = 'assistant'");
    // An error row must not count as an answer — that is what it is replacing.
    expect(sql).toContain("c.kind = 'message'");
  });

  it('judges each reaped thread on its own, not on the batch', async () => {
    reaped([
      { id: 1, user_id: 501, status: 'failed', status_line: 'x', answered: true, was_asked: true },
      { id: 2, user_id: 501, status: 'failed', status_line: 'x', answered: false, was_asked: true },
      { id: 3, user_id: 501, status: 'failed', status_line: 'x', answered: true, was_asked: true },
      // Row 33: a newborn goal thread in the same batch, judged on its own.
      {
        id: 4,
        user_id: 501,
        status: 'failed',
        status_line: 'x',
        answered: false,
        was_asked: false,
      },
    ]);

    await sweepOrphanedRuns();

    expect(saveThreadMessage).toHaveBeenCalledTimes(1);
    expect((saveThreadMessage as jest.Mock).mock.calls[0][0]).toBe(2);
    // All four still had their stale status cleared.
    expect(emitThreadUpdated).toHaveBeenCalledTimes(4);
  });
});

/**
 * Ticket 20 row 33 — the split goal's chat that held nothing but an error.
 *
 * Thread 16905, 17 September. A second need typed into goal 4852's chat opened
 * goal 4853 on a thread of its own; the seat clicked it in the sidebar and
 * landed on „a technical delay occurred, the answer could not be finished".
 * The plan arrived two minutes later.
 *
 * This sweep wrote that, and the thread was created by the row 33 fix itself —
 * deliberately status 'working', because the plan turn is queued four seconds
 * out and „done" would have been a lie. A newborn thread is silent for the
 * same reason a newborn is, and after seventy-five seconds it looked exactly
 * like a thread whose run had died.
 */
describe('row 33 — a thread nobody has asked anything in', () => {
  it('clears the stale status but claims no failed reply', async () => {
    reaped([
      {
        id: 16905,
        user_id: 501,
        status: 'failed',
        status_line: 'ვერ დასრულდა',
        answered: false,
        was_asked: false,
      },
    ]);

    const n = await sweepOrphanedRuns();

    expect(n).toBe(1);
    // The spinner still has to stop.
    expect(emitThreadUpdated).toHaveBeenCalled();
    // „Your reply could not be finished" is a claim about a reply the owner is
    // owed, and they have not asked for one here.
    expect(saveThreadMessage).not.toHaveBeenCalled();
  });

  it('still reports a dead run on a thread the owner DID type in', async () => {
    reaped([
      {
        id: 16904,
        user_id: 501,
        status: 'failed',
        status_line: 'ვერ დასრულდა',
        answered: false,
        was_asked: true,
      },
    ]);

    await sweepOrphanedRuns();

    expect(saveThreadMessage).toHaveBeenCalledTimes(1);
  });
});

/**
 * 18 September, thread 17724 — a run the reaper killed left the only message
 * on an English owner's screen in Georgian: 57 Georgian characters, no Latin.
 * It is the one message a person reads carefully, because it is the one saying
 * something went wrong.
 */
describe('the line a reaped run leaves behind', () => {
  it('is written in the language of the conversation', async () => {
    (threadLanguage as jest.Mock).mockResolvedValue('en');
    reaped([
      {
        id: 17724,
        user_id: 501,
        status: 'failed',
        status_line: 'x',
        answered: false,
        was_asked: true,
      },
    ]);

    await sweepOrphanedRuns();

    const [, , , text] = (saveThreadMessage as jest.Mock).mock.calls[0];
    expect(String(text)).not.toMatch(/[\u10A0-\u10FF]/);
    expect(String(text)).toMatch(/try again/i);
  });

  it('falls back to Georgian when the language cannot be read', async () => {
    // A thread whose language cannot be worked out still gets a failure line —
    // losing the message would be worse than getting its language wrong.
    (threadLanguage as jest.Mock).mockRejectedValue(new Error('down'));
    reaped([
      {
        id: 17724,
        user_id: 501,
        status: 'failed',
        status_line: 'x',
        answered: false,
        was_asked: true,
      },
    ]);

    await sweepOrphanedRuns();

    const [, , , text] = (saveThreadMessage as jest.Mock).mock.calls[0];
    expect(String(text)).toContain('ტექნიკური შეფერხება');
  });
});

/**
 * Ticket 20 row 214 — a dead run has to END on the screen, not only in the row.
 *
 * The seat watched thread 18086 for four minutes. The run died at 18:01:08 and
 * the error was written into the thread — correct, stored, in the right
 * language. The open page showed the step list frozen on „Searching saved
 * info…": no spinner, no error, no retry. A reload produced all three at once.
 *
 * This is row 113's ninth pass in a second place, and its note in the route
 * says the whole of it: „run_complete is the only thing that ends a run for
 * the client". The sweep told every device the THREAD's new status, which
 * repaints the chat list, and never told the open conversation that the run it
 * was watching had ended.
 *
 * (The run itself died because of a deploy of mine that landed nine seconds
 * after it started. That is row 205's problem, not this one. This row is about
 * what the person is shown afterwards, and it would read the same however the
 * run died.)
 */
describe('row 214 — the screen is told the run is over', () => {
  const REAPED = {
    id: 18086,
    user_id: 501,
    status: 'failed',
    status_line: 'ვერ დასრულდა',
    answered: false,
    was_asked: true,
  };

  /** The sweep's UPDATE, then the lookup of the run that died. */
  function withStamp(runId: string | null): void {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('run_prompt_stamps')) {
        return Promise.resolve({
          rows: runId === null ? [] : [{ run_id: runId }],
          rowCount: runId === null ? 0 : 1,
        } as never);
      }
      return Promise.resolve({ rows: [REAPED], rowCount: 1 } as never);
    });
  }

  it('ends the run on the open page, naming the run that died', async () => {
    withStamp('b157b21e-3a62-4632-bd56-f55bc9f70261');

    await sweepOrphanedRuns();

    expect(emitRunError).toHaveBeenCalledWith(
      '501',
      18086,
      'b157b21e-3a62-4632-bd56-f55bc9f70261',
      expect.stringContaining('ვერ'),
    );
    // And the chat list is still repainted — this is in addition to that, not
    // instead of it.
    expect(emitThreadUpdated).toHaveBeenCalled();
  });

  it('puts the run id on the error row too, so the failure can be traced', async () => {
    withStamp('b157b21e-3a62-4632-bd56-f55bc9f70261');

    await sweepOrphanedRuns();

    // Row 202: the row recording a run's death was the one row that could not
    // be joined back to the run.
    expect(saveThreadMessage).toHaveBeenCalledWith(
      18086,
      501,
      'assistant',
      expect.any(String),
      'error',
      'b157b21e-3a62-4632-bd56-f55bc9f70261',
    );
  });

  it('still writes the error when no run can be named, and says so', async () => {
    // A run that died before it was ever stamped. The person still gets the
    // message and the badge still clears; what they do not get is the spinner
    // stopping without a reload, and that is worth a line in the log rather
    // than a silence.
    withStamp(null);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await sweepOrphanedRuns();

    expect(saveThreadMessage).toHaveBeenCalled();
    expect(emitRunError).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no run stamp'));
    warn.mockRestore();
  });

  it('says nothing about a run on a thread it decided not to write an error for', async () => {
    // A thread that had already answered gets its status cleared and no error
    // — and must not get a run_error either, which would end a run on screen
    // that finished properly.
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('run_prompt_stamps')) {
        return Promise.resolve({ rows: [{ run_id: 'x' }], rowCount: 1 } as never);
      }
      return Promise.resolve({
        rows: [{ ...REAPED, answered: true }],
        rowCount: 1,
      } as never);
    });

    await sweepOrphanedRuns();

    expect(emitRunError).not.toHaveBeenCalled();
    expect(emitThreadUpdated).toHaveBeenCalled();
  });
});

/**
 * The seat's 332 — thirteen threads on an account that has never written a
 * Georgian character, and six of them captioned „ველოდები პასუხს" or
 * „შენი პასუხი სჭირდება".
 *
 * The sweep reaps every stale run in ONE statement, which is right — it is the
 * part that must not race. A caption cannot be written there, because it
 * belongs to each owner's own language and the statement has no owner. So the
 * statement writes NULL and the loop fills it in per thread, before anybody is
 * told anything.
 *
 * NULL rather than a Georgian placeholder: for the milliseconds in between, a
 * missing caption is honest and a wrong one is not.
 */
describe('row 332 — the caption a reaped run leaves behind', () => {
  it('is written in the conversation’s language, not in Georgian', async () => {
    (threadLanguage as jest.Mock).mockResolvedValue('en');
    reaped([{ id: 17724, user_id: 501, status: 'failed', answered: false, was_asked: true }]);

    await sweepOrphanedRuns();

    const [, , line] = (updateThreadStatus as jest.Mock).mock.calls[0];
    expect(String(line)).not.toMatch(/[Ⴀ-ჿ]/);
    // And the screen is told the same string that was stored.
    expect((emitThreadUpdated as jest.Mock).mock.calls[0][1].status_line).toBe(line);
  });

  it('follows each thread separately inside one sweep', async () => {
    // Both threads answered, so nothing writes an error and the caption is the
    // only thing asking each one what language it is in.
    (threadLanguage as jest.Mock).mockResolvedValueOnce('en').mockResolvedValueOnce('ka');
    reaped([
      { id: 1, user_id: 501, status: 'failed', answered: true, was_asked: true },
      { id: 2, user_id: 502, status: 'needs_you', answered: true, was_asked: true },
    ]);

    await sweepOrphanedRuns();

    const lines = (updateThreadStatus as jest.Mock).mock.calls.map((c) => String(c[2]));
    expect(lines[0]).not.toMatch(/[Ⴀ-ჿ]/);
    expect(lines[1]).toMatch(/[Ⴀ-ჿ]/);
  });

  it('the statement itself writes no caption — it has no owner to write one for', async () => {
    reaped([]);

    await sweepOrphanedRuns();

    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain('status_line = NULL');
  });

  /**
   * FOUR HOURS OF THIS SWEEP THROWING, AND EVERY TEST ABOVE STAYED GREEN.
   *
   * `54af32f`, 20 September 10:13 — I removed two Georgian captions from the
   * statement, which took out the `$1` and `$2` they were bound to, and left
   * the interval reading `$3` over a one-element array. Postgres numbers by the
   * highest reference, so it wanted three parameters, got one, and answered
   * „could not determine data type of parameter $1" every twenty seconds until
   * 14:20, inside a `catch` that logs and carries on.
   *
   * The tests here mock `query`, so the SQL text is the one part of this
   * statement they never execute. This is the part they were missing: the
   * placeholders, held against the arguments actually passed.
   */
  it('asks for no parameter it was not given', async () => {
    reaped([]);

    await sweepOrphanedRuns();

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(() => assertPlaceholdersMatchParams(sql, params)).not.toThrow();
  });
});
