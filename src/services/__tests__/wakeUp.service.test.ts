jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../threads.service', () => ({
  __esModule: true,
  createThread: jest.fn(),
  saveThreadMessage: jest.fn(),
}));
jest.mock('../sse.service', () => ({ __esModule: true, emitThreadCreated: jest.fn() }));
jest.mock('../notification.service', () => ({
  __esModule: true,
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));

import { query } from '../../db/postgres/client';
import { createThread, saveThreadMessage } from '../threads.service';
import { buildWakeUpMessage, listWakeUpCandidates, previewWakeUpMessage } from '../wakeUp.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

const ROW = {
  id: 526,
  phone: '+995599140815',
  facts: ['occupation: CEO, Arci'],
  phonebook: '2386',
  contacts_on_netai: '16',
  registered_at: '2026-03-04T10:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('listWakeUpCandidates', () => {
  it('returns the counts as numbers and the date as an ISO string', async () => {
    mockQuery.mockResolvedValue(rows([ROW]) as never);

    const out = await listWakeUpCandidates();

    expect(out).toEqual([
      {
        user_id: 526,
        phone: '+995599140815',
        facts: ['occupation: CEO, Arci'],
        phonebook: 2386,
        contacts_on_netai: 16,
        registered_at: '2026-03-04T10:00:00.000Z',
      },
    ]);
  });

  it('only ever names people who have NOT opened Netai', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await listWakeUpCandidates();

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    // A thread, a search or a subscription all mean they are already here.
    expect(sql).toContain('FROM threads t');
    expect(sql).toContain('FROM search_activity sa');
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM netai n WHERE n.id = usr.id)');
  });

  it('wakes only someone we can say something specific to', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await listWakeUpCandidates();

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    // Dormant alone is 62,121 of 62,164 accounts — the public role fact is
    // what makes the list a list, and the message writable.
    expect(sql).toContain('f.is_public AND f.retracted_at IS NULL');
    expect(params[1]).toEqual(['role', 'occupation', 'employer', 'expertise', 'headline']);
  });

  it('ranks by how much of their own network is already here', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await listWakeUpCandidates();

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('ORDER BY contacts_on_netai DESC, phonebook DESC, c.id');
  });

  it('caps the limit — a bulk read of this is not a bulk send', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await listWakeUpCandidates(100_000);

    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toBe(500);
  });

  it('never returns fewer than one row of headroom for a silly limit', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await listWakeUpCandidates(0);

    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toBe(1);
  });
});

const CANDIDATE = {
  user_id: 526,
  phone: '+995599140815',
  facts: ['occupation: CEO, Arci'],
  phonebook: 2386,
  contacts_on_netai: 16,
  registered_at: '2026-03-04T10:00:00.000Z',
};

describe('the wake-up wording', () => {
  it('says "your network is already here", never "come in"', () => {
    const message = buildWakeUpMessage(CANDIDATE, 'ბესო');

    // The one number that makes the sentence true, and their own phonebook.
    expect(message).toContain('16 ადამიანი უკვე იყენებს');
    expect(message).toContain('2 386');
    expect(message).toContain('ბესო');
  });

  it('repeats what the public record says, and offers to be corrected', () => {
    const message = buildWakeUpMessage(CANDIDATE, 'ბესო');

    expect(message).toContain('CEO, Arci');
    expect(message).toContain('თუ არაზუსტია');
  });

  // The facts arrive alphabetically, so the first is „employer: Arci" far more
  // often than the title. The first live preview read „our record says: Arci".
  it('says the title, not the company, when it has both', () => {
    const message = buildWakeUpMessage(
      { ...CANDIDATE, facts: ['employer: Arci', 'occupation: CEO, Arci'] },
      'ბესო',
    );

    expect(message).toContain('წერია: CEO, Arci');
    expect(message).not.toContain('წერია: Arci');
  });

  // A role fact is a career, not a sentence.
  it('says the current role, not the whole career line', () => {
    const message = buildWakeUpMessage(
      {
        ...CANDIDATE,
        facts: [
          'role: CEO @ Arci (2020–present); rose from Finance Officer (2005) to CEO within the one company',
        ],
      },
      'ბესო',
    );

    expect(message).toContain('წერია: CEO @ Arci (2020–present).');
    expect(message).not.toContain('Finance Officer');
  });

  it('says nothing rather than a paragraph, when even the current role is long', () => {
    const long = 'a'.repeat(200);
    const message = buildWakeUpMessage({ ...CANDIDATE, facts: [`role: ${long}`] }, 'ბესო');

    expect(message).not.toContain('ჩვენს ჩანაწერში');
  });

  it('falls back to the company when that is all the record has', () => {
    const message = buildWakeUpMessage({ ...CANDIDATE, facts: ['employer: Arci'] }, 'ბესო');

    expect(message).toContain('წერია: Arci');
  });

  it('claims nothing about somebody the record says nothing about', () => {
    const message = buildWakeUpMessage({ ...CANDIDATE, facts: [] }, 'ბესო');

    expect(message).not.toContain('ჩვენს ჩანაწერში');
    expect(message).toContain('16 ადამიანი უკვე იყენებს');
  });
});

describe('previewWakeUpMessage', () => {
  it('delivers the real wording to each reviewer and to nobody else', async () => {
    (createThread as jest.Mock).mockResolvedValue({
      id: 9001,
      type: 'regular',
      title: 't',
      is_task: true,
      status: 'needs_you',
      status_line: 's',
    });

    const out = await previewWakeUpMessage(['501', '160584'], CANDIDATE, 'ბესო');

    expect(out).toHaveLength(2);
    expect(out.map((p) => p.reviewer_user_id)).toEqual(['501', '160584']);
    // Two threads, both in reviewers' own accounts.
    expect((createThread as jest.Mock).mock.calls.map((c) => c[0])).toEqual(['501', '160584']);
    // And the reviewer is told plainly that nothing has gone out.
    const body = (saveThreadMessage as jest.Mock).mock.calls[0][3] as string;
    expect(body).toContain('არავისთვის გაგზავნილა');
    expect(body).toContain('16 ადამიანი უკვე იყენებს');
  });
});
